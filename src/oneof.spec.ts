import { Component, inject } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { FormlyFieldConfig } from '@ngx-formly/core';
import { FormlyForm, provideFormlyCore } from '@ngx-formly/core';
import { FormlyJsonschema } from '@ngx-formly/core/json-schema';
import type { JSONSchema7 } from 'json-schema';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppComponent } from './app';
import { FORMLY_CONFIG } from './formly-config';

/**
 * The four failing expectations are the bug report:
 *   - "re-applies the selected branch default to a replaced model"
 *   - "marks the form dirty when the user switches branch"
 *   - "passes the branch selector through the map callback"
 *   - "carries the oneOf node's title onto the selector"
 * The other four pass and rule out a broken setup.
 */
describe('ngx-formly 7.1.0 JSON Schema oneOf', () => {
  let fixture: ComponentFixture<AppComponent>;

  const settle = async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideFormlyCore(FORMLY_CONFIG)] });
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    // The component snapshots the model, then replaces the reference, each on its own tick.
    await settle();
    await settle();
  });

  /** Drives the real `<select>`, so the ControlValueAccessor marks its own control dirty. */
  const selectBranch = (index: number): void => {
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.selectedIndex = index;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  it('applies the selected branch default on the first render', () => {
    expect(fixture.componentInstance.modelAtFirstRender.output?.timeoutMs).toBe(5000);
  });

  it('re-applies a default declared outside the oneOf to a replaced model', () => {
    expect(fixture.componentInstance.modelAfterModelReplaced?.name).toBe('my-job');
  });

  it('re-applies the selected branch default to a replaced model', () => {
    expect(fixture.componentInstance.modelAfterModelReplaced?.output?.timeoutMs).toBe(5000);
  });

  it('re-applies the branch default once the branch is hidden and shown again', async () => {
    selectBranch(1);
    selectBranch(0);
    await settle();
    expect(fixture.componentInstance.model.output?.timeoutMs).toBe(5000);
  });

  it('marks the form dirty when the user switches branch', () => {
    selectBranch(1);
    // The switch did change the model, so the form no longer holds what it loaded with.
    expect(fixture.componentInstance.model.output?.rotateMb).toBe(100);
    expect(fixture.componentInstance.form.dirty).toBe(true);
  });
});

/** Issue 3: the selector is the one field a consumer cannot reach through a supported API. */
describe('ngx-formly 7.1.0 JSON Schema oneOf branch selector', () => {
  const SCHEMA: JSONSchema7 = {
    type: 'object',
    properties: {
      output: {
        title: 'Output',
        oneOf: [
          { title: 'HTTP', type: 'object', properties: { url: { type: 'string' } } },
          { title: 'File', type: 'object', properties: { path: { type: 'string' } } },
        ],
      },
    },
  };

  @Component({
    selector: 'app-map-host',
    imports: [ReactiveFormsModule, FormlyForm],
    template: `<form [formGroup]="form"><formly-form [form]="form" [fields]="fields" [model]="model" /></form>`,
  })
  class MapHostComponent {
    readonly form = new FormGroup({});
    readonly model = {};
    /** Every field `map` was called for, as `key:type`. */
    readonly mapped: string[] = [];
    readonly fields: FormlyFieldConfig[] = [
      inject(FormlyJsonschema).toFieldConfig(SCHEMA, {
        map: field => {
          this.mapped.push(`${String(field.key ?? '(no key)')}:${field.type ?? '(no type)'}`);
          return field;
        },
      }),
    ];
  }

  let fixture: ComponentFixture<MapHostComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideFormlyCore(FORMLY_CONFIG)] });
    fixture = TestBed.createComponent(MapHostComponent);
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));
    fixture.detectChanges();
  });

  const selector = (): FormlyFieldConfig | undefined => {
    const find = (fields: FormlyFieldConfig[]): FormlyFieldConfig | undefined => {
      for (const field of fields) {
        if (field.type === 'multischema') {
          return field;
        }
        const found = field.fieldGroup && find(field.fieldGroup);
        if (found) {
          return found;
        }
      }
      return undefined;
    };
    return find(fixture.componentInstance.fields)?.fieldGroup?.[0];
  };

  it('builds the selector, so the branches are switchable at all', () => {
    expect(selector()?.type).toBe('enum');
  });

  it('passes the branch selector through the map callback', () => {
    expect(fixture.componentInstance.mapped).toContain('(no key):enum');
  });

  it("carries the oneOf node's title onto the selector", () => {
    expect(selector()?.props?.['label']).toBe('Output');
  });
});
