import { JsonPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { FormlyFieldConfig } from '@ngx-formly/core';
import { FormlyForm } from '@ngx-formly/core';
import { FormlyJsonschema } from '@ngx-formly/core/json-schema';
import type { JSONSchema7 } from 'json-schema';

/**
 * `output` is a plain `oneOf`. Each branch declares a `default` for one of its own properties,
 * as JSON Schema allows. `name` sits outside the `oneOf` and is the control case: it proves the
 * default plumbing itself works, so any difference between the two is the bug.
 */
const SCHEMA: JSONSchema7 = {
  type: 'object',
  title: 'Job',
  properties: {
    name: { type: 'string', title: 'Name', default: 'my-job' },
    output: {
      title: 'Output',
      oneOf: [
        {
          title: 'HTTP',
          type: 'object',
          properties: {
            url: { type: 'string', title: 'URL' },
            timeoutMs: { type: 'integer', title: 'Timeout (ms)', default: 5000 },
          },
          required: ['url'],
        },
        {
          title: 'File',
          type: 'object',
          properties: {
            path: { type: 'string', title: 'Path' },
            rotateMb: { type: 'integer', title: 'Rotate (MB)', default: 100 },
          },
          required: ['path'],
        },
      ],
    },
  },
};

export interface JobModel {
  name?: string;
  output?: { url?: string; timeoutMs?: number; path?: string; rotateMb?: number };
}

@Component({
  selector: 'app-root',
  imports: [JsonPipe, ReactiveFormsModule, FormlyForm],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  readonly form = new FormGroup({});
  readonly fields: FormlyFieldConfig[] = [inject(FormlyJsonschema).toFieldConfig(SCHEMA)];

  /** Not readonly: a host that loads its record asynchronously hands Formly a new object. */
  model: JobModel = {};

  /** The model right after the first render, before the reference was replaced. */
  modelAtFirstRender: JobModel = {};
  /** The model after the reference was replaced with an empty record. */
  modelAfterModelReplaced: JobModel | null = null;

  private modelJsonAfterReplace = '';

  constructor() {
    // One macrotask after bootstrap: built, expressions run, nothing touched by a user.
    setTimeout(() => {
      this.modelAtFirstRender = structuredClone(this.model);
      this.replaceModel();
    });
  }

  /**
   * What every host does that renders the form before its data arrives, and what any
   * ControlValueAccessor wrapper does in `writeValue`: hand Formly a new model object.
   * The record is empty here, so every default should be re-applied to it.
   */
  replaceModel(): void {
    this.model = {};
    setTimeout(() => {
      this.modelAfterModelReplaced = structuredClone(this.model);
      this.modelJsonAfterReplace = JSON.stringify(this.model);
    });
  }

  /** Control case: a default outside any `oneOf` is re-applied to the new model. */
  get plainDefaultReapplied(): boolean {
    return this.modelAfterModelReplaced?.name === 'my-job';
  }

  /** Issue 1: the selected branch's default is not re-applied to the new model. */
  get branchDefaultReapplied(): boolean {
    return this.modelAfterModelReplaced?.output?.timeoutMs === 5000;
  }

  get branchDefaultAppliedAtFirstRender(): boolean {
    return this.modelAtFirstRender.output?.timeoutMs === 5000;
  }

  get modelChanged(): boolean {
    return this.modelJsonAfterReplace !== '' && JSON.stringify(this.model) !== this.modelJsonAfterReplace;
  }

  /** Issue 2: the model changed, and the form is still pristine. */
  get dirtyTracksBranchSwitch(): boolean {
    return !this.modelChanged || this.form.dirty;
  }

  /** Issue 3: the `oneOf` node's `title` never reaches the selector, so it renders unlabelled. */
  get selectorLabel(): string | undefined {
    const selector = findMultiSchemaField(this.fields)?.fieldGroup?.[0];
    return selector?.props?.['label'] as string | undefined;
  }

  get selectorLabelled(): boolean {
    return this.selectorLabel !== undefined;
  }

  get modelJson(): string {
    return JSON.stringify(this.model, null, 2);
  }

  discard(): void {
    this.form.reset();
  }
}

/** The `multischema` node has no key, so a consumer can only find it by walking the tree. */
function findMultiSchemaField(fields: FormlyFieldConfig[]): FormlyFieldConfig | undefined {
  for (const field of fields) {
    if (field.type === 'multischema') {
      return field;
    }
    const found = field.fieldGroup && findMultiSchemaField(field.fieldGroup);
    if (found) {
      return found;
    }
  }
  return undefined;
}
