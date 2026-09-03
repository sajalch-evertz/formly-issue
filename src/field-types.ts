import { Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import type { FieldTypeConfig } from '@ngx-formly/core';
import {
  FieldArrayType,
  FieldType,
  FormlyAttributes,
  FormlyField,
  FormlyValidationMessage,
} from '@ngx-formly/core';

/**
 * The field types below are the stock ones from the ngx-formly JSON Schema docs
 * (https://formly.dev/docs/guides/json-schema), with the same Bootstrap classes those examples
 * use. Nothing here is customised: the point of the repro is that the bugs live in
 * `@ngx-formly/core` + `@ngx-formly/core/json-schema`, not in a UI theme package or in a
 * hand-rolled renderer. `@ngx-formly/bootstrap` is deliberately not installed; Bootstrap is here
 * as a stylesheet and nothing else.
 */

@Component({
  selector: 'formly-field-input',
  imports: [ReactiveFormsModule, FormlyAttributes],
  template: `
    @if (props.type === 'checkbox') {
      <div class="form-check">
        <input
          type="checkbox"
          class="form-check-input"
          [id]="id"
          [formControl]="formControl"
          [formlyAttributes]="field"
        />
        <label class="form-check-label" [for]="id">{{ props.label }}</label>
      </div>
    } @else {
      <label class="form-label" [for]="id">{{ props.label }}</label>
      <input
        class="form-control"
        [id]="id"
        [type]="props.type || 'text'"
        [formControl]="formControl"
        [formlyAttributes]="field"
      />
    }
  `,
})
export class InputTypeComponent extends FieldType<FieldTypeConfig> {}

/** `type: 'enum'` is what the JSON Schema service emits for a schema enum and for the
 * oneOf/anyOf branch selector. */
@Component({
  selector: 'formly-field-enum',
  imports: [ReactiveFormsModule],
  template: `
    <label class="form-label" [for]="id">{{ props.label || 'Select' }}</label>
    <select class="form-select" [id]="id" [formControl]="formControl" [multiple]="!!props.multiple">
      @for (option of selectOptions; track option.value) {
        <option [ngValue]="option.value" [disabled]="!!option.disabled">{{ option.label }}</option>
      }
    </select>
  `,
})
export class EnumTypeComponent extends FieldType<FieldTypeConfig> {
  get selectOptions(): { label: string; value: string | number; disabled?: boolean }[] {
    return (this.props.options ?? []) as { label: string; value: string | number; disabled?: boolean }[];
  }
}

/**
 * Registered for both `object` and `multischema`. Both do the one thing the docs' example does:
 * render `field.fieldGroup`.
 */
@Component({
  selector: 'formly-group-type',
  imports: [FormlyField, FormlyValidationMessage],
  template: `
    @if (props.label) {
      <legend class="fs-6 fw-semibold">{{ props.label }}</legend>
    }
    @if (props.description) {
      <p class="text-secondary small">{{ props.description }}</p>
    }
    @if (showError && formControl.errors) {
      <div class="alert alert-danger py-1 px-2 small">
        <formly-validation-message [field]="field" />
      </div>
    }
    @for (f of field.fieldGroup; track $index) {
      <div class="mb-3">
        <formly-field [field]="f" />
      </div>
    }
  `,
})
export class GroupTypeComponent extends FieldType {}

/** `type: 'array'`, as in the docs' example. */
@Component({
  selector: 'formly-array-type',
  imports: [FormlyField],
  template: `
    <fieldset>
      @if (props.label) {
        <legend class="fs-6 fw-semibold">{{ props.label }}</legend>
      }
      @for (f of field.fieldGroup; track $index) {
        <div class="d-flex gap-2 align-items-end mb-2">
          <div class="flex-grow-1"><formly-field [field]="f" /></div>
          <button type="button" class="btn btn-outline-secondary btn-sm" (click)="remove($index)">
            Remove
          </button>
        </div>
      }
      <button type="button" class="btn btn-outline-primary btn-sm" (click)="add()">Add</button>
    </fieldset>
  `,
})
export class ArrayTypeComponent extends FieldArrayType {}
