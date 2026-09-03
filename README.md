# ngx-formly: schema defaults are lost when the form is handed a new model object

Minimal reproduction of two independent issues.

1. A schema `default` is applied only when its field appears on screen, so a later write of the
   `[model]` never gets one. Everything inside a `oneOf` is affected, visible or not.
2. Changing a `oneOf` branch selector changes the model but leaves the form pristine.

**Live:** https://sajalch-evertz.github.io/formly-issue/

## Versions

| Package | Version |
| --- | --- |
| `@ngx-formly/core` | 7.1.0 |
| `@angular/core` | 20.3.27 |
| TypeScript | 5.8.3 |
| Node | 22 |

- No UI theme package: `@ngx-formly/bootstrap` is not installed, Bootstrap is a stylesheet only.
- The field types in [`src/field-types.ts`](src/field-types.ts) are the ones the
  [JSON Schema guide](https://formly.dev/docs/guides/json-schema) says to register, and each one
  just renders its control or its `fieldGroup`.

## Run it

```bash
npm install
npm start    # http://localhost:4300, a PASS/FAIL panel for both issues
```

`src/main.ts` imports `@angular/compiler` before bootstrapping, so the app also runs in a sandbox
that bundles without the Angular CLI and therefore without the Angular Linker.

---

## Issue 1: a `default` is applied only when its field becomes visible, so a later write loses it

- A schema `default` is written into the model **only** when its field appears on screen.
- Each write to the form hands Formly a **new** object, and only the first write makes the branch
  appear.
- So every later write leaves the branch fields blank. `name`, outside the `oneOf`, survives.

### What you see

Write 2 handed over an empty record, exactly like the one write 1 filled in:

```json
after write 1:  { "name": "my-job", "output": { "url": "https://example.test/ingest", "timeoutMs": 5000 } }
after write 2:  { "name": "my-job" }
```

### Steps

1. `npm start` and open the page. `Name` shows `my-job`; `URL` and `Timeout (ms)` are empty.
2. Card 1 (first render) holds the branch defaults. Card 2 (after the new model) does not.
3. Switch the branch to `File` and back and they reappear; press `Discard` and they go again.

### Why a form is written to more than once

Angular's contract, not something the page arranges:

- `setUpControl()` calls `writeValue(control.value)` the instant a `ControlValueAccessor`
  registers, and on a fresh `NgModel` that value is `null`. `NgModel._updateValue` then defers the
  real value to a microtask, so it always lands after that. Every discard writes again.
- A wrapper must clone per write, or Formly mutates a store object. So it rebuilds at least twice
  on load and once per discard. No ordering avoids it.

### Why "appears on screen" catches every `oneOf`

- `resolveMultiSchema()` puts a `hide` expression on every branch, so everything inside inherits
  one without the schema asking. That is `timeoutMs`, which has none of its own.
- `url` has its own, `"hide": "!formState.isAdmin"`, on a flag that is `true` throughout, so the
  field is visible the whole time. Lost too.
- Either is enough. No `oneOf` needed: one plain field with a `hide` expression and a `default`
  loses it the same way.

### The schema

```jsonc
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "default": "my-job" },   // control, no hide expression
    "output": {
      "oneOf": [
        { "title": "HTTP", "type": "object", "properties": {
            "url": { "type": "string", "default": "https://example.test/ingest",
                     "widget": { "formlyConfig": { "expressions": { "hide": "!formState.isAdmin" } } } },
            "timeoutMs": { "type": "integer", "default": 5000 } } },
        { "title": "File", "type": "object", "properties": {
            "path": { "type": "string", "default": "/var/log/job.log",
                      "widget": { "formlyConfig": { "expressions": { "hide": "!formState.isAdmin" } } } },
            "rotateMb": { "type": "integer", "default": 100 } } }
      ]
    }
  }
}
```

### Why the default goes in only once

Only two places in Formly write a `defaultValue` into the model, and a rebuild reaches neither.

- **`CoreExtension.onPopulate` skips it.** Its gate ends in `!isHiddenField(field)`, and
  `isHiddenField` tests whether a `hide` expression **exists**, not what it evaluates to:

  ```ts
  const isHidden = (f) => f.hide || f.expressions?.hide || f.hideExpression;
  ```

  `f.expressions.hide` is a function, so it is permanently truthy, and the walk up the parents
  covers everything inside a branch. A visible field counts as hidden.

- **`changeHideState()`'s `hide === false` arm holds the other one**, and it runs only on a
  **transition** of `field.hide`.

- **There is no transition.** `build()` ends with `checkExpressions(field, true)`, which
  re-assigns `field.hide = false` over `false`, and `observe()`'s setter drops a write that does
  not change the value:

  ```ts
  set: (currentValue) => {
    if (currentValue !== state.value) { ...state.onChange.forEach(...) }
  }
  ```

  Nothing reaches `_hiddenFieldsForCheck`, so `postPopulate` has nothing to drain. Meanwhile
  `registerControl()` patches the control to the new model's `undefined`, which blanks the input.

- **The passing cases fit.** First render assigns `false` over `undefined`, a real transition.
  Switching branch away and back is two of them, which is why the values come back.

### `resetOnHide` is the deciding term, and its global switch cannot reach a branch

```ts
let setDefaultValue = !field.resetOnHide || !isHidden(field);
```

- With `resetOnHide` falsy the default is assigned at build time and the defect disappears, no
  hide transition required.
- This repro sets `extras: { resetFieldOnHide: true }` explicitly in
  [`src/formly-config.ts`](src/formly-config.ts), which is Formly's own default, so the premise is
  stated rather than implied.
- Two ways to turn it off, only one works. Measured, model before the second write and after:

| | before | after |
| --- | --- | --- |
| stock config | `{"url": "...", "timeoutMs": 5000}` | `{}` |
| `extras: { resetFieldOnHide: false }` | `{"url": "...", "timeoutMs": 5000}` | `{}` |
| `resetOnHide: false` on `timeoutMs` only | `{"url": "...", "timeoutMs": 5000}` | `{"timeoutMs": 5000}` |

The app-level switch makes no difference, because the JSON schema service overrides it for
anything under a `oneOf`:

```ts
// formly-json-schema.service.ts
if (options.resetOnHide) {
  field.resetOnHide = true;
}
```

`resolveMultiSchema()` always passes `resetOnHide: true` in those options, so for a branch and
everything inside it `resetOnHide` is `true` whatever the application configured.

### Consumer workaround

Per field, through Formly's schema extension. It is merged later in `_toFieldConfig()` than the
line above, and `CoreExtension` respects it because it tests `field.resetOnHide !== false`:

```jsonc
"timeoutMs": {
  "type": "integer",
  "default": 5000,
  "widget": { "formlyConfig": { "resetOnHide": false } }
}
```

- It changes reset semantics: a genuinely hidden field now keeps its value in the model, so an
  access-gated field would submit its default to a user who cannot see it.
- It has to go on every property that declares a `default`.

### Suggestion

Either make `isHiddenField()` consult the evaluated hide state rather than the presence of an
expression, so `CoreExtension` can assign the default for a field that is visible, or re-apply
`defaultValue` when a visible field's control is re-registered against a new model.

---

## Issue 2: switching branch changes the model but leaves the form pristine

### Steps

1. Select **File** in the branch selector.
2. The model becomes `{ "name": "my-job", "output": { "rotateMb": 100 } }`, so the form no longer
   holds what it loaded with.
3. `form.dirty` is still `false`.

### Expected

A user-driven branch change reaches the form's dirty state: `form.dirty` becomes `true`.

### Actual

`form.dirty` stays `false` for as long as the user only switches branches, so nothing driven by
the form's pristine state sees the change.

### Why it happens

The selector `resolveMultiSchema()` builds has no `key`:

```ts
{
  type: 'enum',
  defaultValue: -1,
  props: { multiple: mode === 'anyOf', options: schemas.map(...) },
  hooks: { onInit: (f) => f.formControl.valueChanges.pipe(tap(() => f.options.detectChanges(f.parent))) },
}
```

and `registerControl()` returns early for a field without a key:

```ts
if (!field.form || !hasKey(field)) {
  return;
}
```

- The selector's control is never attached to the form.
- Its `ControlValueAccessor` marks that detached control dirty on a real user selection.
- The root form never hears about it.

### Suggestion

Have `resolveMultiSchema()` propagate the selection to the form's dirty state, for example a
`props.change` on the selector that marks the root control dirty.

### Consumer workaround

```ts
selector.props.change = (field: FormlyFieldConfig): void => {
  let root = field;
  while (root.parent) {
    root = root.parent;
  }
  root.formControl?.markAsDirty();
};
```

---

## Ruled out

Issue 1 is not specific to a schema shape. Defaults are applied correctly on the first render for:

- a property-level `oneOf`
- a root-level `oneOf` alongside `properties`
- `array.items.oneOf` with a row already in the model
- a row added through the array's Add button
- all of the above at one and at two levels of nesting

The only trigger is a later write of the `[model]`, and the only condition is that a `hide`
expression exists on the field or on an ancestor.
