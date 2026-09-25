# ngx-formly: a field visible on first paint loses its schema `default`

Minimal reproduction of two independent issues.

1. A field with a `hide` expression, or inside a `oneOf` branch, that is visible when the form is
   handed its record never gets its schema `default`.
2. Changing a `oneOf` branch selector changes the model but leaves the form pristine.

**Live:** <https://sajalch-evertz.github.io/formly-issue/>

## Versions

| Package | Version |
| --- | --- |
| `@ngx-formly/core` | 7.1.0 |
| `@angular/core` | 20.3.27 |
| TypeScript | 5.8.3 |
| Node | 22 |

- No UI theme package: `@ngx-formly/bootstrap` is not installed, Bootstrap is a stylesheet only.
- The field types in [`src/field-types.ts`](src/field-types.ts) are the ones the
  [JSON Schema guide](https://formly.dev/docs/guides/json-schema) says to register.

## Run it

```bash
npm install
npm start    # http://localhost:4300
```

## How the form is hosted

Nothing on the page writes the model by hand. The form is hosted the way a real screen hosts it:

- [`src/json-form.component.ts`](src/json-form.component.ts) is a cut-down copy of a production
  `ControlValueAccessor` wrapper around `<formly-form>`. `writeValue` clones the incoming record,
  because Formly mutates its model and the record comes from an immutable store.
- [`src/app.ts`](src/app.ts) loads the form data from an API call and binds the record with
  `[ngModel]`. `formState.isAdmin`, which the `hide` expressions read, is already `true`: the
  current user was loaded before this screen, as it usually is in an app.

## The schema

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

---

## Issue 1: a visible field never gets its `default`

### What you see

Formly's model 2 s after load. The user is an admin, so `URL` and `Timeout (ms)` are both on
screen:

| `name` | `output.url` | `output.timeoutMs` |
| --- | --- | --- |
| `"my-job"` | **missing** | **missing** |

### Steps

1. `npm start` and open the page. `Name` shows `my-job`; `URL` and `Timeout (ms)` are empty.
2. Switch the branch to `File` and back: the values come back. Press `Discard`: they go again.

### Minimal form

JSON Schema, `oneOf` and the wrapper are not needed.
[`src/minimal.component.ts`](src/minimal.component.ts) is plain `<formly-form>` with three fields
and one `this.model = {}` after the first render:

| Field | Config | Default after the swap |
| --- | --- | --- |
| `plain` | `defaultValue: "p"` | kept |
| `withHide` | `defaultValue: "h"`, `expressions: { hide: "false" }` | **lost** |
| `hideProp` | `defaultValue: "f"`, `hide: false` | kept |

### Why

1. **The first build applies the defaults.** Each field's `hide` goes from `undefined` to
   `false`, a real transition.
2. **`[ngModel]` then writes the record into the wrapper.** Angular's `NgModel` hands the value
   over in `writeValue`, and the wrapper clones it, so Formly gets a new, empty model object and
   rebuilds against it. A discard does the same.
3. **The rebuild does not re-apply the defaults.** Only two places in Formly write a
   `defaultValue` into the model, and neither runs:

   - **`CoreExtension.onPopulate` skips it.** Its gate ends in `!isHiddenField(field)`, and
     `isHiddenField` tests whether a `hide` expression **exists**, not what it evaluates to:

     ```ts
     const isHidden = (f) => f.hide || f.expressions?.hide || f.hideExpression;
     ```

     The walk up the parents covers everything inside a branch, because `resolveMultiSchema()`
     puts a `hide` expression on every branch. A visible field counts as hidden.

   - **`changeHideState()`'s `hide === false` arm** runs only on a **transition** of
     `field.hide`, and `false` over `false` is none: `observe()`'s setter drops a write that does
     not change the value.

To isolate step 2: with `writeValue` not reassigning the model, every default is kept.

### `resetOnHide` is the deciding term, and its global switch cannot reach a branch

```ts
let setDefaultValue = !field.resetOnHide || !isHidden(field);
```

- With `resetOnHide` falsy the default is assigned at build time, no hide transition required.
- `extras: { resetFieldOnHide: false }` makes no difference inside a `oneOf`, because the JSON
  schema service sets `field.resetOnHide = true` for anything under one, whatever the app says.

### Consumer workaround

Per field, through Formly's schema extension:

```jsonc
"timeoutMs": {
  "type": "integer",
  "default": 5000,
  "widget": { "formlyConfig": { "resetOnHide": false } }
}
```

It changes reset semantics: a genuinely hidden field now keeps its value in the model, so an
access-gated field would submit its default to a user who cannot see it. The other workaround is
to force every field hidden until the form has settled, then flip it visible: Formly does write
a default when a field goes from hidden to visible.

### Suggestion

Make `isHiddenField()` consult the evaluated hide state rather than the presence of an
expression. Or re-apply `defaultValue` when a visible field's control is re-registered against a
new model.

---

## Issue 2: switching branch changes the model but leaves the form pristine

### Steps

1. Select **File** in the branch selector.
2. The model changes, so the form no longer holds what it loaded with.
3. `form.dirty` is still `false`, and **Discard** stays disabled.

### Why

The selector `resolveMultiSchema()` builds has no `key`, and `registerControl()` returns early for
a field without one:

```ts
if (!field.form || !hasKey(field)) {
  return;
}
```

The selector's control is never attached to the form, so a user selection marks a detached
control dirty and the root form never hears about it.

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
