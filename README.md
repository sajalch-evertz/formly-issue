# ngx-formly: a `hide` expression loses a field's `default` when the model reference is replaced

Minimal reproduction of two independent issues.

1. **Any** field whose self or ancestor carries a `hide` expression loses its schema `default`
   when the `[model]` reference is replaced, even while the field is visible. Defaults on fields
   without a `hide` expression are re-applied normally. Every `oneOf` / `anyOf` form is affected
   without opting in, because `resolveMultiSchema()` puts a `hide` expression on every branch.
2. Changing a `oneOf` branch selector changes the model but leaves the form pristine.

**Live:** https://sajalch-evertz.github.io/formly-issue/

## Versions

| Package | Version |
| --- | --- |
| `@ngx-formly/core` | 7.1.0 |
| `@angular/core` | 20.3.27 |
| TypeScript | 5.8.3 |
| Node | 22 |

No UI theme package is involved: `@ngx-formly/bootstrap` is not installed, and Bootstrap is here
as a stylesheet and nothing else. The only field types registered are the ones the
[JSON Schema guide](https://formly.dev/docs/guides/json-schema) says to register
(`string`, `number`, `integer`, `boolean`, `enum`, `array`, `object`, `multischema`), and they are
in [`src/field-types.ts`](src/field-types.ts): each one just renders its control or its
`fieldGroup`.

## Run it

```bash
npm install
npm start    # http://localhost:4300, a PASS/FAIL panel for both issues
```

`src/main.ts` imports `@angular/compiler` before bootstrapping, so the app also runs in a sandbox
that bundles without the Angular CLI and therefore without the Angular Linker. It makes no
difference to `ng build` or `ng test`.

---

## Issue 1: a visible field with a `hide` expression loses its `default`

### The schema

Every property in a branch declares a `default`. `url` and `path` additionally carry a `hide`
expression gated on an access flag, the everyday reason a field has one. `formState.isAdmin` is
`true`, so both are visible the whole time. `name` sits outside the `oneOf` with no `hide`
expression and is the control.

```jsonc
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "default": "my-job" },   // control, no hide expression
    "output": {
      "title": "Output",
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

### Steps

1. Render `<formly-form>` with an empty model and `formState: { isAdmin: true }`. Everything is
   correct at this point:

   ```json
   { "name": "my-job", "output": { "url": "https://example.test/ingest", "timeoutMs": 5000 } }
   ```

2. Assign a **new** empty object to the `[model]` input. That is what a host does when it renders
   before its data arrives, and what any `ControlValueAccessor` wrapper does in `writeValue`. The
   new record is empty, exactly like the one the form started from, so every default should be
   applied to it again.

3. The model is now:

   ```json
   { "name": "my-job" }
   ```

### Expected

Every `default` in the schema is re-applied to the new record.

### Actual

| | first render | after the reference is replaced |
| --- | --- | --- |
| `name`, no `hide` expression | `"my-job"` | `"my-job"` |
| `output.url`, its own `hide` expression, visible | `"https://example.test/ingest"` | **missing** |
| `output.timeoutMs`, inherits the branch's `hide` expression | `5000` | **missing** |

Both branch inputs render empty. Switching the branch away and back restores both, which shows
the code that applies the defaults works and simply never runs on a rebuild.

`url` and `timeoutMs` are lost for the same reason, and it is not `oneOf` specific: `url` has a
`hide` expression of its own and `timeoutMs` only inherits the one
`resolveMultiSchema()` puts on the branch. Either is enough. A schema with no composition at all,
one plain field with a `hide` expression and a `default`, loses it the same way.

### Why it happens

Replacing the model reference makes `FormlyForm.ngOnChanges` call `builder.build(this.field)`
again over the same field objects. Four things happen in that rebuild, and between them nothing
puts the default back.

**1. The build-time assignment is skipped.** `CoreExtension.onPopulate` has one gate for defaults:

```ts
if (hasKey(field) && !isUndefined(field.defaultValue) &&
    isUndefined(getFieldValue(field)) && !isHiddenField(field)) {
  assignFieldValue(field, field.defaultValue);
}
```

The first three conditions hold. The fourth fails, because `isHiddenField()` tests whether a
`hide` expression **exists**, not what it evaluates to:

```ts
const isHidden = (f) => f.hide || f.expressions?.hide || f.hideExpression;
```

`f.expressions.hide` is a function, so it is permanently truthy. The walk up the parents means
this covers the field itself and everything beneath it. A visible field is treated as hidden for
the purposes of its own default.

**2. The existing control is cleared to match the new model.** `FieldFormExtension.addFormControl`
finds the control from the first render, still holding the default, sets
`control.defaultValue = getFieldValue(field)` which is now `undefined`, and `registerControl()`
then reaches:

```ts
if (!(isNil(control.value) && isNil(value)) && control.value !== value && control instanceof FormControl) {
  control.patchValue(value);
}
```

so the value is patched to `undefined`. Correct on its own terms, and it means the default now has
to be re-applied by someone.

**3. The `hide` expression re-applies its old value, silently.** `builder.build()` ends with
`options.checkExpressions(field, true)`. With `ignoreCache` set, every expression re-applies even
when unchanged, so `evalExpr(field, 'hide', false)` runs and assigns `field.hide = false`. That
write goes through the `observe()` installed on `hide`, whose setter is guarded:

```ts
set: (currentValue) => {
  if (currentValue !== state.value) { ...state.onChange.forEach(...) }
}
```

`field.hide` was already `false`. `false !== false` is false, so no observer fires.

**4. So the only remaining assignment never runs.** That observer is the only thing that pushes
into `options._hiddenFieldsForCheck`, which is the only thing `FieldExpressionExtension.postPopulate`
drains into `changeHideState()`. Its `hide === false` arm holds the only other
`assignFieldValue(field, field.defaultValue)` in the codebase. Empty queue, arm never runs.

This also explains the two passing controls. On the **first** render step 3 assigns `false` over
`undefined`, which is a real change, so the observer fires and the default lands. And **switching
a branch** away and back produces two real transitions, `false` to `true` to `false`, so the
second one restores the default. A field's `default` under a `hide` expression has only ever been
applied by riding a hide transition, and a rebuild against a new model produces none.

### `resetOnHide` is the deciding term, and its global switch cannot reach a branch

The gate in `isHiddenField()` starts with `resetOnHide`:

```ts
let setDefaultValue = !field.resetOnHide || !isHidden(field);
```

so with `resetOnHide` falsy the default is assigned at build time and the defect disappears, no
hide transition required. This repro sets `extras: { resetFieldOnHide: true }` explicitly in
[`src/formly-config.ts`](src/formly-config.ts), which is Formly's own default, so the premise is
stated rather than implied. There are two ways to turn it off and only one of them works.

Measured on this repro, model as it stands before the replacement and after it:

| | before | after |
| --- | --- | --- |
| stock config | `{"url": "...", "timeoutMs": 5000}` | `{}` |
| `extras: { resetFieldOnHide: false }` | `{"url": "...", "timeoutMs": 5000}` | `{}` |
| `resetOnHide: false` on `timeoutMs` only | `{"url": "...", "timeoutMs": 5000}` | `{"timeoutMs": 5000}` |

The app-level switch makes no difference at all, because the JSON schema service overrides it for
anything under a `oneOf`:

```ts
// formly-json-schema.service.ts
if (options.resetOnHide) {
  field.resetOnHide = true;
}
```

and `resolveMultiSchema()` always passes `resetOnHide: true` in those options. For a branch and
everything inside it, `resetOnHide` is `true` whatever the application configured.

### Consumer workaround

Per field, through Formly's schema extension, which is merged later in `_toFieldConfig()` than the
line above and which `CoreExtension` respects because it tests `field.resetOnHide !== false`:

```jsonc
"timeoutMs": {
  "type": "integer",
  "default": 5000,
  "widget": { "formlyConfig": { "resetOnHide": false } }
}
```

Two caveats. It changes reset semantics for that field: a genuinely hidden field now keeps its
value in the model, so an access-gated field would still submit its default to a user who cannot
see it. And it has to be applied to every property that declares a `default`, since the setting is
per field.

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
the form's pristine state can see the change.

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

so the selector's control is never attached to the form. The `ControlValueAccessor` marks that
detached control dirty on a real user selection, and the root form never hears about it.

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

Issue 1 is not specific to a schema shape. Defaults are applied correctly on the first render for
a property-level `oneOf`, a root-level `oneOf` alongside `properties`, `array.items.oneOf` with a
row in the model, and a row added through the array's Add button, at one and at two levels of
nesting. The trigger is only the `[model]` reference being replaced afterwards, and the condition
is only that a `hide` expression exists on the field or on an ancestor.
