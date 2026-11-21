import { Component, computed, input } from '@angular/core';
import { TECHNICAL_SPECIFICATIONS } from './technical-specifications';

@Component({
  selector:'technical-sheet', standalone:true,
  templateUrl:'./technical-sheet.component.html',
  styleUrl:'./technical-sheet.component.css'
})
export class TechnicalSheetComponent {
  readonly modelId=input.required<string>();
  readonly specification=computed(()=>TECHNICAL_SPECIFICATIONS[this.modelId()]);
}
