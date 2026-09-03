// Must come before bootstrap. Sandboxes (CodeSandbox, StackBlitz) that bundle without the
// Angular CLI never run the Angular Linker, so partially compiled libraries fall back to JIT and
// need the compiler present. Harmless under `ng build`, which compiles ahead of time anyway.
import '@angular/compiler';

import { bootstrapApplication } from '@angular/platform-browser';
import { provideFormlyCore } from '@ngx-formly/core';

import { AppComponent } from './app';
import { FORMLY_CONFIG } from './formly-config';

void bootstrapApplication(AppComponent, {
  providers: [provideFormlyCore(FORMLY_CONFIG)],
}).catch((error: unknown) => console.error(error));
