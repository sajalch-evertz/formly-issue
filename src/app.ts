import { JsonPipe } from "@angular/common";
import { Component, inject } from "@angular/core";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import type { FormlyFieldConfig, FormlyFormOptions } from "@ngx-formly/core";
import { FormlyForm } from "@ngx-formly/core";
import { FormlyJsonschema } from "@ngx-formly/core/json-schema";
import type { JSONSchema7 } from "json-schema";

/**
 * `widget.formlyConfig` is Formly's schema extension for attaching field config to a property.
 * `JSONSchema7` does not describe it, and `toFieldConfig` takes a plain `JSONSchema7`, so declare
 * the shape rather than casting the literal.
 */
type FormlySchema = JSONSchema7 & {
  widget?: { formlyConfig?: FormlyFieldConfig };
  properties?: Record<string, FormlySchema>;
  oneOf?: FormlySchema[];
};

/**
 * Every property in a branch declares a `default`. `url` and `path` also carry a `hide`
 * expression gated on an access flag, the everyday reason a field has one; `isAdmin` is `true`,
 * so they stay visible. `name` sits outside the `oneOf` with no `hide` expression: the control.
 */
const SCHEMA: FormlySchema = {
  type: "object",
  title: "Job",
  properties: {
    name: { type: "string", title: "Name", default: "my-job" },
    output: {
      oneOf: [
        {
          title: "HTTP",
          type: "object",
          properties: {
            url: {
              type: "string",
              title: "URL (admin only)",
              default: "https://example.test/ingest",
              widget: {
                formlyConfig: { expressions: { hide: "!formState.isAdmin" } },
              },
            },
            timeoutMs: {
              type: "integer",
              title: "Timeout (ms)",
              default: 5000,
            },
          },
        },
        {
          title: "File",
          type: "object",
          properties: {
            path: {
              type: "string",
              title: "Path (admin only)",
              default: "/var/log/job.log",
              widget: {
                formlyConfig: { expressions: { hide: "!formState.isAdmin" } },
              },
            },
            rotateMb: { type: "integer", title: "Rotate (MB)", default: 100 },
          },
        },
      ],
    },
  },
};

export interface JobModel {
  name?: string;
  output?: {
    url?: string;
    timeoutMs?: number;
    path?: string;
    rotateMb?: number;
  };
}

@Component({
  selector: "app-root",
  imports: [JsonPipe, ReactiveFormsModule, FormlyForm],
  templateUrl: "./app.html",
  styleUrl: "./app.css",
})
export class AppComponent {
  readonly form = new FormGroup({});
  readonly fields: FormlyFieldConfig[] = [
    inject(FormlyJsonschema).toFieldConfig(SCHEMA),
  ];
  /** `isAdmin` is true, so the gated fields are visible throughout. */
  readonly options: FormlyFormOptions = { formState: { isAdmin: true } };

  /** Not readonly: a host that loads its record asynchronously hands Formly a new object. */
  model: JobModel = {};

  /** The record as loaded, kept for the discard. */
  private readonly loadedRecord: JobModel = {};

  /** The model right after the first render, before the reference was replaced. */
  modelAtFirstRender: JobModel = {};
  /** The model after the reference was replaced with an empty record. */
  modelAfterModelReplaced: JobModel | null = null;

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
    setTimeout(
      () => (this.modelAfterModelReplaced = structuredClone(this.model)),
    );
  }

  /** Control case: the default outside the `oneOf` is re-applied to the new model. */
  get plainDefaultReapplied(): boolean {
    return this.modelAfterModelReplaced?.name === "my-job";
  }

  get branchDefaultsAppliedAtFirstRender(): boolean {
    const output = this.modelAtFirstRender.output;
    return (
      output?.url === "https://example.test/ingest" &&
      output?.timeoutMs === 5000
    );
  }

  /** Issue 1: neither the gated field nor its sibling gets its default back. */
  get branchDefaultsReapplied(): boolean {
    const output = this.modelAfterModelReplaced?.output;
    return (
      output?.url === "https://example.test/ingest" &&
      output?.timeoutMs === 5000
    );
  }

  get modelChanged(): boolean {
    const replaced = this.modelAfterModelReplaced;
    return (
      replaced !== null &&
      JSON.stringify(this.model) !== JSON.stringify(replaced)
    );
  }

  /** Issue 2: the model changed, and the form is still pristine. */
  get dirtyTracksBranchSwitch(): boolean {
    return !this.modelChanged || this.form.dirty;
  }

  /**
   * A discard as a `ControlValueAccessor` host implements it: write the loaded record back in and
   * go pristine. That replaces the `[model]` reference, so it hits issue 1 again.
   */
  discard(): void {
    this.model = structuredClone(this.loadedRecord);
    this.form.markAsPristine();
    this.form.updateValueAndValidity();
  }
}
