# ngx-formly JSON Schema `oneOf`: three issues

Minimal reproduction of three independent issues in the JSON Schema `oneOf` / `anyOf` support:

1. When the `[model]` reference is replaced after the first render, the selected branch's schema
   `default`s are not re-applied. Defaults declared outside the `oneOf` are.
2. Changing the branch selector changes the model but leaves the form pristine.
3. The branch selector carries no label, and no supported API can reach it to give it one.

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
npm test     # 4 checks pass, 4 fail. The failures are the three issues.
npm start    # http://localhost:4300, same thing in the browser with a PASS/FAIL panel
```

`src/main.ts` imports `@angular/compiler` before bootstrapping, so the app also runs in a sandbox
that bundles without the Angular CLI and therefore without the Angular Linker. It makes no
difference to `ng build` or `ng test`.

## The schema

```jsonc
{
  "type": "object",
  "properties": {
    // control cases, outside the oneOf
    "name":    { "type": "string",  "default": "my-job" },
    "enabled": { "type": "boolean", "default": true },
    "retries": { "type": "integer", "default": 3 },

    "output": {
      "title": "Output",
      "oneOf": [
        { "title": "HTTP", "type": "object",
          "properties": { "url":       { "type": "string" },
                          "method":    { "type": "string", "enum": ["POST", "PUT", "PATCH"],
                                         "default": "POST" },
                          "timeoutMs": { "type": "integer", "default": 5000 } },
          "required": ["url"] },
        { "title": "File", "type": "object",
          "properties": { "path":     { "type": "string" },
                          "rotateMb": { "type": "integer", "default": 100 },
                          "compress": { "type": "boolean", "default": true } },
          "required": ["path"] }
      ]
    }
  }
}
```

---

## Issue 1: a replaced `[model]` reference loses the selected branch's defaults

### Steps

1. Render `<formly-form>` with an empty model. Everything is correct at this point:

   ```json
   {
     "name": "my-job", "enabled": true, "retries": 3,
     "output": { "method": "POST", "timeoutMs": 5000 }
   }
   ```

2. Assign a **new** empty object to the `[model]` input. This is what a host does when it renders
   the form before its data arrives, and what any `ControlValueAccessor` wrapper does in
   `writeValue`.

3. The model is now:

   ```json
   { "name": "my-job", "enabled": true, "retries": 3 }
   ```

### Expected

Every `default` in the schema is re-applied to the new record, `output.method` and
`output.timeoutMs` included. It is an empty record, exactly like the one the form started from.

### Actual

`name`, `enabled` and `retries` are re-applied. Every default inside the selected branch is
dropped, whatever its type, and those inputs render empty. Switching the branch away and back
restores them, which shows the code that applies branch defaults works and simply never runs on a
rebuild.

Failing spec: `re-applies the selected branch defaults to a replaced model` in
[`src/oneof.spec.ts`](src/oneof.spec.ts).

### Why it happens

Two rules meet, and between them nothing assigns the default:

- `resolveMultiSchema()` in `src/core/json-schema/formly-json-schema.service.ts` gives every
  branch an `expressions.hide` and `resetOnHide: true`.
- `isHiddenField()` in `src/core/src/lib/utils.ts` treats a field as hidden when a `hide`
  expression merely **exists**, whatever it evaluates to:

  ```ts
  const isHidden = (f) => f.hide || f.expressions?.hide || f.hideExpression;
  ```

  So for anything inside a branch it walks up, finds the branch, and reports hidden. That makes
  `CoreExtension` in `src/core/src/lib/extensions/core/core.ts` skip the build-time assignment:

  ```ts
  if (hasKey(field) && !isUndefined(field.defaultValue) &&
      isUndefined(getFieldValue(field)) && !isHiddenField(field)) {
    assignFieldValue(field, field.defaultValue);
  }
  ```

- The only other place a `defaultValue` reaches the model is `changeHideState()` in
  `src/core/src/lib/extensions/field-expression-legacy/field-expression.ts`, in its
  `hide === false` arm. That runs on a **transition** of `field.hide`.

On the first render `field.hide` goes from `undefined` to `false`, that is a transition, and the
defaults land. On a rebuild with a new model reference the selected branch's `field.hide` is
already `false`, there is no transition, and so no code path assigns the default at all.

### Suggestion

Either make `isHiddenField()` look at the evaluated hide state instead of the presence of an
expression, so `CoreExtension` can assign the default for a branch that is visible, or re-apply
`defaultValue` when a visible field's control is re-registered against a new model.

---

## Issue 2: switching branch changes the model but leaves the form pristine

### Steps

1. Select **File** in the `Output` selector.
2. The model becomes `{ ..., "output": { "rotateMb": 100, "compress": true } }`, so the form no
   longer holds what it loaded with.
3. `form.dirty` is still `false`.

### Expected

A user-driven branch change reaches the form's dirty state: `form.dirty` becomes `true`.

### Actual

`form.dirty` stays `false` for as long as the user only switches branches, so nothing driven by
the form's pristine state can see the change.

Failing spec: `marks the form dirty when the user switches branch` in
[`src/oneof.spec.ts`](src/oneof.spec.ts).

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

`registerControl()` in `src/core/src/lib/utils.ts` returns early for a field without a key:

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

## Issue 3: the branch selector carries no label, and nothing can reach it to give it one

### Steps

1. Give the `oneOf` node a `title`, as in the schema above: `"output": { "title": "Output", "oneOf": [...] }`.
2. Render the form and look at the selector.
3. Pass a `map` callback to `toFieldConfig` and log every field it is called for.

### Expected

The selector is a field like any other: it carries the `oneOf` node's title so a field type can
render it, and `map` is called for it so a consumer can configure it.

### Actual

- The selector's `props.label` is `undefined`. The `title` stays on the `oneOf` node, which
  `_toFieldConfig` types as `formly-group`, and that renders no label, so the title appears
  nowhere in the form. Whatever the user sees above the choice is fallback text hardcoded by the
  field type.
- `map` is called for the branches and their properties (`url:string`, `output:object`,
  `path:string`, `output:object`) and for the `oneOf` node itself, but never for the selector:
  `resolveMultiSchema()` builds it as a literal and never routes it through `_toFieldConfig()`,
  which is the only place `map` is applied.
- The selector has no `key` either, so it cannot be addressed by key.

Together that leaves no supported way to label, translate, or set any prop on the one field the
user actually interacts with. The only route is to walk `field.fieldGroup[0]` of the
`multischema` node and mutate the object Formly built.

Failing specs: `passes the branch selector through the map callback` and
`carries the oneOf node's title onto the selector`.

### Suggestion

Route the selector through `_toFieldConfig()` (or at least through `options.map`), and copy the
`oneOf` node's `title` and `description` onto it.

---

## Ruled out

Both issues reproduce with a stock setup. In particular, issue 1 is not specific to a schema
shape: the defaults are applied correctly on the first render for a property-level `oneOf`, a
root-level `oneOf` alongside `properties`, `array.items.oneOf` with a row in the model, and a row
added through the array's Add button, at one and at two levels of nesting. The trigger is only the
`[model]` reference being replaced afterwards.
