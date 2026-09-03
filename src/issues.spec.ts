import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideFormlyCore } from '@ngx-formly/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppComponent } from './app';
import { FORMLY_CONFIG } from './formly-config';

/**
 * The two failing expectations are the bug report:
 *   - "loses the branch defaults when the model reference is replaced"
 *   - "marks the form dirty when the user switches branch"
 * The other three pass and rule out a broken setup.
 */
describe('ngx-formly 7.1.0', () => {
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

  /** Drives the real `<select>`, the only one on the page, so the CVA marks its control dirty. */
  const selectBranch = (index: number): void => {
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.selectedIndex = index;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  /** `url` carries its own `hide` expression, `timeoutMs` only inherits the branch's. */
  const HTTP_DEFAULTS = { url: 'https://example.test/ingest', timeoutMs: 5000 };

  it('applies the selected branch defaults on the first render', () => {
    expect(fixture.componentInstance.modelAtFirstRender.output).toMatchObject(HTTP_DEFAULTS);
  });

  it('re-applies the default outside the oneOf to a replaced model', () => {
    expect(fixture.componentInstance.modelAfterModelReplaced?.name).toBe('my-job');
  });

  it('loses the branch defaults when the model reference is replaced', () => {
    expect(fixture.componentInstance.modelAfterModelReplaced?.output).toMatchObject(HTTP_DEFAULTS);
  });

  it('re-applies the branch defaults once the branch is hidden and shown again', async () => {
    selectBranch(1);
    selectBranch(0);
    await settle();
    expect(fixture.componentInstance.model.output).toMatchObject(HTTP_DEFAULTS);
  });

  it('marks the form dirty when the user switches branch', () => {
    selectBranch(1);
    // The switch did change the model, so the form no longer holds what it loaded with.
    expect(fixture.componentInstance.model.output).toMatchObject({
      path: '/var/log/job.log',
      rotateMb: 100,
    });
    expect(fixture.componentInstance.form.dirty).toBe(true);
  });
});
