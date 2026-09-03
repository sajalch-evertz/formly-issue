import type { ConfigOption } from '@ngx-formly/core';

import {
  ArrayTypeComponent,
  EnumTypeComponent,
  GroupTypeComponent,
  InputTypeComponent,
} from './field-types';

/** Shared by the app bootstrap and the spec so the two can never drift apart. */
export const FORMLY_CONFIG: ConfigOption = {
  // Formly's default, stated here so the repro's premise is explicit rather than implied.
  extras: { resetFieldOnHide: true },
  types: [
    { name: 'string', component: InputTypeComponent },
    { name: 'number', component: InputTypeComponent, defaultOptions: { props: { type: 'number' } } },
    { name: 'integer', component: InputTypeComponent, defaultOptions: { props: { type: 'number' } } },
    { name: 'boolean', component: InputTypeComponent, defaultOptions: { props: { type: 'checkbox' } } },
    { name: 'enum', component: EnumTypeComponent },
    { name: 'array', component: ArrayTypeComponent },
    { name: 'object', component: GroupTypeComponent },
    { name: 'multischema', component: GroupTypeComponent },
  ],
};
