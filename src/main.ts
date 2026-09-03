import { bootstrapApplication } from '@angular/platform-browser';
import { provideFormlyCore } from '@ngx-formly/core';

import { AppComponent } from './app';
import { FORMLY_CONFIG } from './formly-config';

void bootstrapApplication(AppComponent, {
  providers: [provideFormlyCore(FORMLY_CONFIG)],
}).catch((error: unknown) => console.error(error));
