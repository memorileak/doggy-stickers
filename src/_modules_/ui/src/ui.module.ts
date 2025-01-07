import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';

import {UpperFirstCharPipe} from './upper-first-char.pipe';

@NgModule({
  declarations: [UpperFirstCharPipe],
  imports: [CommonModule],
  exports: [UpperFirstCharPipe],
})
export class UiModule {}
