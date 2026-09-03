import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideFormlyCore } from '@ngx-formly/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppComponent } from './app';
import { FORMLY_CONFIG } from './formly-config';

/**
 * The two failing expectations are the bug report:
 *   - "re-applies the selected branch default to a replaced model"
 *   - "marks the form dirty when the user switches branch"
 * The other three pass and rule out a broken setup.
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

  /** The branch selector, found by its options rather than by position. */
  const branchSelect = (): HTMLSelectElement => {
    const selects = Array.from<HTMLSelectElement>(fixture.nativeElement.querySelectorAll('select'));
    const select = selects.find(el =>
      Array.from(el.options).some(option => option.textContent?.trim() === 'HTTP'),
    );
    if (!select) {
      throw new Error('branch selector not found');
    }
    return select;
  };

  /** Drives the real `<select>`, so the ControlValueAccessor marks its own control dirty. */
  const selectBranch = (index: number): void => {
    const select = branchSelect();
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
