import type { OnChanges, OnInit, SimpleChanges } from "@angular/core";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  forwardRef,
  DestroyRef,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import type { ControlValueAccessor } from "@angular/forms";
import { FormGroup, NG_VALUE_ACCESSOR, ReactiveFormsModule } from "@angular/forms";
import type { FormlyFieldConfig, FormlyFormOptions } from "@ngx-formly/core";
import { FormlyForm } from "@ngx-formly/core";
import { FormlyJsonschema } from "@ngx-formly/core/json-schema";
import type { JSONSchema7 } from "json-schema";
import type { Observable } from "rxjs";

type JsonObject = Record<string, unknown>;

/**
 * A trimmed copy of a real production wrapper around `<formly-form>`, so the page uses the form
 * exactly as the app does. It's a `ControlValueAccessor`, so a screen binds it with `[ngModel]`.
 *
 * Kept: everything that touches the model. Removed: readonly mode, translations, layout helpers,
 * and the pristine/valid outputs. None of those affects the bug.
 */
@Component({
  selector: "app-json-form",
  imports: [ReactiveFormsModule, FormlyForm],
  template: `
    <form [formGroup]="formGroup">
      <formly-form
        [fields]="formlyFields"
        [form]="formGroup"
        [model]="model"
        [options]="formlyOptions"
        (modelChange)="onModelChange($event)"
      />
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => JsonFormComponent), multi: true },
  ],
})
export class JsonFormComponent implements OnInit, OnChanges, ControlValueAccessor {
  /** The schema as given. Cloned before use, because Formly mutates what it's handed. */
  @Input({ alias: "schema", required: true }) readonlySchema?: JSONSchema7 | null;
  @Input() formlyOptions: FormlyFormOptions = {};
  @Input() resetForm$?: Observable<void>;

  schema!: JSONSchema7;
  model: JsonObject = {};
  formGroup = new FormGroup({});
  formlyFields: FormlyFieldConfig[] = [];

  /** The last record written in, for `resetForm$`. */
  private _originalValue: JsonObject | null | undefined;

  private onChangeHandler?: (value: JsonObject) => void;
  private onTouchedHandler?: () => void;

  private readonly formlyJsonschema = inject(FormlyJsonschema);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  /** Discard: write the loaded record back in and mark the form pristine. */
  ngOnInit(): void {
    this.resetForm$?.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.writeValue(this._originalValue);
      this.formGroup.markAsPristine();
      this.formGroup.updateValueAndValidity();
    });
  }

  /** Rebuild the Formly fields when the schema or the options change. */
  ngOnChanges(changes: SimpleChanges): void {
    let initFormly = false;
    if (changes["readonlySchema"] && this.readonlySchema) {
      this.schema = cloneJson(this.readonlySchema);
      initFormly = true;
    } else if (changes["formlyOptions"]) {
      initFormly = true;
    }
    if (initFormly && this.schema) {
      this.initFormly();
    }
  }

  /** Pass Formly's model changes up to `[ngModel]`. */
  onModelChange(value: JsonObject): void {
    this.onChangeHandler?.(value);
    this.onTouchedHandler?.();
  }

  /**
   * Called by `[ngModel]` whenever the screen hands over a record: on load, and on every discard.
   *
   * This is where the bug is triggered. Formly mutates its model, so the record is cloned into a
   * brand-new object. Formly then rebuilds against that new, empty model, and a field that was
   * already visible does not get its `default` written in again.
   */
  writeValue(value: JsonObject | null | undefined): void {
    this._originalValue = value;
    this.model = cloneJson(value ?? {});
    this.changeDetectorRef.detectChanges();
  }

  registerOnChange(fn: (value: JsonObject) => void): void {
    this.onChangeHandler = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouchedHandler = fn;
  }

  private initFormly(): void {
    const fieldConfig = this.formlyJsonschema.toFieldConfig(this.schema);
    this.formlyFields = [fieldConfig];
  }
}

/** Deep copy through JSON. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
