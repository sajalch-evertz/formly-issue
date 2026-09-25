import { JsonPipe } from "@angular/common";
import { Component } from "@angular/core";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import type { FormlyFieldConfig } from "@ngx-formly/core";
import { FormlyForm } from "@ngx-formly/core";

/**
 * Issue 1 with nothing else in the way: plain `<formly-form>`, no JSON Schema, no `oneOf`, no
 * `ngModel` wrapper. The only step is replacing the model once the form has rendered.
 */
@Component({
  selector: "app-minimal",
  imports: [JsonPipe, ReactiveFormsModule, FormlyForm],
  template: `
    <form [formGroup]="form">
      <formly-form [fields]="fields" [form]="form" [model]="model" />
    </form>
    <table class="table table-sm mb-0 align-middle">
      <tbody>
        <tr>
          <th scope="row"
            >Before <code>this.model = {{ "{}" }}</code></th
          >
          <td
            ><code>{{ before | json }}</code></td
          >
        </tr>
        <tr>
          <th scope="row">After</th>
          <td
            ><code>{{ after | json }}</code></td
          >
        </tr>
        <tr>
          <th scope="row"><code>withHide</code> kept its default</th>
          <td>
            @if (!after) {
              <span class="badge text-bg-secondary">waiting</span>
            } @else if (after.withHide === "h") {
              <span class="badge text-bg-success">PASS</span>
            } @else {
              <span class="badge text-bg-danger">FAIL</span>
            }
          </td>
        </tr>
      </tbody>
    </table>
  `,
})
export class MinimalComponent {
  readonly form = new FormGroup({});
  model: Record<string, unknown> = {};
  before: Record<string, unknown> | null = null;
  after: Record<string, unknown> | null = null;

  readonly fields: FormlyFieldConfig[] = [
    {
      key: "plain",
      type: "string",
      className: "d-block mb-3",
      defaultValue: "p",
      props: { label: 'plain (no hide), default: "p"' },
    },
    {
      key: "withHide",
      className: "d-block mb-3",
      type: "string",
      defaultValue: "h",
      expressions: { hide: "false" },
      props: {
        label:
          "withHide (expressions.hide: 'false'), default: \"h\".\nSkipped after the model swap: " +
          "Formly counts any field with a hide expression as hidden, whatever it evaluates to, " +
          "and hide stays false, so there is no hidden-to-visible change to write it back",
      },
    },
    {
      key: "hideProp",
      type: "string",
      className: "d-block mb-3",
      defaultValue: "f",
      hide: false,
      props: { label: 'hideProp (hide: false), default: "f"' },
    },
  ];

  constructor() {
    setTimeout(() => {
      this.before = structuredClone(this.model);
      this.model = {};
    }, 300);
    setTimeout(() => (this.after = structuredClone(this.model)), 800);
  }
}
