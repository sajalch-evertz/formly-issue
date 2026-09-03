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
 * The three field types below are the stock ones from the ngx-formly JSON Schema docs
 * (https://formly.dev/docs/guides/json-schema). Nothing here is customised: the point of the
 * repro is that the bug lives in `@ngx-formly/core` + `@ngx-formly/core/json-schema`, not in a
 * UI theme package or in a hand-rolled renderer.
 */

@Component({
  selector: 'formly-field-input',
  imports: [ReactiveFormsModule, FormlyAttributes],
  template: `
    <label class="row">
      <span class="label">{{ props.label }}</span>
      <input [type]="props.type || 'text'" [formControl]="formControl" [formlyAttributes]="field" />
    </label>
  `,
})
export class InputTypeComponent extends FieldType<FieldTypeConfig> {}

/** `type: 'enum'` is what the JSON Schema service emits for the oneOf/anyOf branch selector. */
@Component({
  selector: 'formly-field-enum',
  imports: [ReactiveFormsModule],
  template: `
    <label class="row">
      <span class="label">{{ props.label || 'Select' }}</span>
      <select [formControl]="formControl" [multiple]="!!props.multiple">
        @for (option of selectOptions; track option.value) {
          <option [ngValue]="option.value" [disabled]="!!option.disabled">{{ option.label }}</option>
        }
      </select>
    </label>
  `,
})
export class EnumTypeComponent extends FieldType<FieldTypeConfig> {
  get selectOptions(): { label: string; value: number; disabled?: boolean }[] {
    return (this.props.options ?? []) as { label: string; value: number; disabled?: boolean }[];
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
    <fieldset>
      @if (props.label) {
        <legend>{{ props.label }}</legend>
      }
      @if (props.description) {
        <p>{{ props.description }}</p>
      }
      @if (showError && formControl.errors) {
        <div class="error"><formly-validation-message [field]="field" /></div>
      }
      @for (f of field.fieldGroup; track $index) {
        <formly-field [field]="f" />
      }
    </fieldset>
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
        <legend>{{ props.label }}</legend>
      }
      @for (f of field.fieldGroup; track $index) {
        <div class="row">
          <formly-field [field]="f" />
          <button type="button" (click)="remove($index)">Remove</button>
        </div>
      }
      <button type="button" (click)="add()">Add</button>
    </fieldset>
  `,
})
export class ArrayTypeComponent extends FieldArrayType {}
