import {Pipe, PipeTransform} from '@angular/core';

@Pipe({
  name: 'upperFirstChar',
  standalone: false,
})
export class UpperFirstCharPipe implements PipeTransform {
  transform(value: string): unknown {
    const firstChar = value?.[0] ?? '';
    const remaining = value?.slice(1) ?? '';
    return firstChar.toUpperCase() + remaining;
  }
}
