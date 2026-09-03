import { JsonPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { FormlyFieldConfig } from '@ngx-formly/core';
import { FormlyForm } from '@ngx-formly/core';
import { FormlyJsonschema } from '@ngx-formly/core/json-schema';
import type { JSONSchema7 } from 'json-schema';

/**
 * `output` is a plain `oneOf`. Each branch declares `default`s for its own properties, as JSON
 * Schema allows. `name`, `enabled` and `retries` sit outside the `oneOf` and are the control
 * case: they prove the default plumbing works, so any difference between them and the branch
 * properties is the bug.
 */
const SCHEMA: JSONSchema7 = {
  type: 'object',
  title: 'Job',
  properties: {
    name: { type: 'string', title: 'Name', default: 'my-job' },
    enabled: { type: 'boolean', title: 'Enabled', default: true },
    retries: { type: 'integer', title: 'Retries', default: 3 },
    output: {
      title: 'Output',
      oneOf: [
        {
          title: 'HTTP',
          type: 'object',
          properties: {
            url: { type: 'string', title: 'URL' },
            method: { type: 'string', title: 'Method', enum: ['POST', 'PUT', 'PATCH'], default: 'POST' },
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
            compress: { type: 'boolean', title: 'Compress', default: true },
          },
          required: ['path'],
        },
      ],
    },
  },
};

export interface JobModel {
  name?: string;
  enabled?: boolean;
  retries?: number;
  output?: {
    url?: string;
    method?: string;
    timeoutMs?: number;
    path?: string;
    rotateMb?: number;
    compress?: boolean;
  };
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

  /** Control case: defaults outside any `oneOf` are re-applied to the new model. */
  get plainDefaults(): Pick<JobModel, 'name' | 'enabled' | 'retries'> {
    const { name, enabled, retries } = this.modelAfterModelReplaced ?? {};
    return { name, enabled, retries };
  }

  get plainDefaultsReapplied(): boolean {
    const { name, enabled, retries } = this.plainDefaults;
    return name === 'my-job' && enabled === true && retries === 3;
  }

  /** Issue 1: the selected branch's defaults are not re-applied to the new model. */
  get branchDefaults(): Pick<NonNullable<JobModel['output']>, 'method' | 'timeoutMs'> {
    const { method, timeoutMs } = this.modelAfterModelReplaced?.output ?? {};
    return { method, timeoutMs };
  }

  get branchDefaultsReapplied(): boolean {
    const { method, timeoutMs } = this.branchDefaults;
    return method === 'POST' && timeoutMs === 5000;
  }

  get branchDefaultsAtFirstRender(): Pick<NonNullable<JobModel['output']>, 'method' | 'timeoutMs'> {
    const { method, timeoutMs } = this.modelAtFirstRender.output ?? {};
    return { method, timeoutMs };
  }

  get branchDefaultsAppliedAtFirstRender(): boolean {
    const { method, timeoutMs } = this.branchDefaultsAtFirstRender;
    return method === 'POST' && timeoutMs === 5000;
  }

  get modelChanged(): boolean {
    return this.modelJsonAfterReplace !== '' && JSON.stringify(this.model) !== this.modelJsonAfterReplace;
  }

  /** Issue 2: the model changed, and the form is still pristine. */
  get dirtyTracksBranchSwitch(): boolean {
    return !this.modelChanged || this.form.dirty;
  }

  get modelJson(): string {
    return JSON.stringify(this.model, null, 2);
  }

  discard(): void {
    this.form.reset();
  }
}
