import { AsyncPipe, JsonPipe } from "@angular/common";
import { Component, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { FormlyFieldConfig, FormlyFormOptions } from "@ngx-formly/core";
import type { JSONSchema7 } from "json-schema";
import type { Observable } from "rxjs";
import { Subject, map, timer } from "rxjs";

import { JsonFormComponent } from "./json-form.component";

/**
 * A JSON schema that may also carry `widget.formlyConfig`, Formly's way of adding field config
 * (here, a `hide` expression) to a property. The standard `JSONSchema7` type doesn't know about it.
 */
type FormlySchema = JSONSchema7 & {
  widget?: { formlyConfig?: FormlyFieldConfig };
  properties?: Record<string, FormlySchema>;
  oneOf?: FormlySchema[];
};

/**
 * The form under test.
 *
 * - `name`: a plain field with a default and no `hide`. It always works, so it's the control.
 * - `output`: a `oneOf` with two branches, HTTP and File. Every field in them has a default.
 * - `url` and `path` are admin-only: hidden while `formState.isAdmin` is false. The user here
 *   is an admin, so they should show up, with their defaults, once `isAdmin` is known.
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

/** The record the form edits. Only the fields the checks read. */
export interface JobModel {
  name?: string;
  output?: { url?: string; timeoutMs?: number };
}

/** A fake HTTP call: emits `value` after `ms` milliseconds. */
function api<T>(value: T, ms: number): Observable<T> {
  return timer(ms).pipe(map(() => value));
}

/**
 * The page. It uses the form the way a real screen does:
 *
 * 1. `isAdmin` is already known (the current user was loaded earlier) and sits in `formState`.
 * 2. Load the schema and the record from an API, then render `eio-json-form`.
 * 3. Pass the record in with `[ngModel]`. There is no hand-written model swap anywhere.
 */
@Component({
  selector: "app-root",
  imports: [AsyncPipe, JsonPipe, FormsModule, JsonFormComponent],
  templateUrl: "./app.html",
  styleUrl: "./app.css",
})
export class AppComponent {
  @ViewChild(JsonFormComponent) jsonForm?: JsonFormComponent;

  /** A new record: the schema plus an empty model, arriving after 300 ms. */
  readonly formData$ = api({ schema: SCHEMA, model: {} as JobModel }, 300);

  /**
   * `formState` is what the `hide` expressions read. The user is an admin, so the admin fields are
   * visible from the very first render.
   */
  readonly formlyOptions: FormlyFormOptions = { formState: { isAdmin: true } };
  /** Emit to discard: the form puts the loaded record back and goes pristine. */
  readonly resetForm$ = new Subject<void>();

  /** A copy of the model taken at 2 s: the form has rendered, nobody has typed yet. */
  settled: JobModel | null = null;

  constructor() {
    timer(2000).subscribe(() => (this.settled = structuredClone(this.jsonForm?.model ?? {})));
  }

  /** The model as it is right now. */
  get model(): JobModel {
    return this.jsonForm?.model ?? {};
  }

  get dirty(): boolean {
    return !!this.jsonForm?.formGroup.dirty;
  }

  /** Control check: `name` has no `hide`, so it should always get its default. Expected PASS. */
  get checkIfPlainDefaultApplied(): boolean {
    return this.settled?.name === "my-job";
  }

  /** Issue 1 check: the HTTP branch is on screen, so `url` and `timeoutMs` should hold their defaults. */
  get checkIfBranchDefaultsApplied(): boolean {
    return (
      this.settled?.output?.url === "https://example.test/ingest" &&
      this.settled?.output?.timeoutMs === 5000
    );
  }

  /** Helper for the Issue 2 check: has the model changed since the 2 s snapshot? */
  get checkIfModelChanged(): boolean {
    return this.settled !== null && JSON.stringify(this.model) !== JSON.stringify(this.settled);
  }

  /** Issue 2 check: once the model changes (e.g. switching branch), the form should be dirty. */
  get checkIfDirtyAfterBranchSwitch(): boolean {
    return !this.checkIfModelChanged || this.dirty;
  }
}
