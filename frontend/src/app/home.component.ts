import { Component, input, output } from '@angular/core';

@Component({
  selector: 'atelier-home',
  standalone: true,
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  readonly modelCount = input(6);
  readonly visit = output<{section: string; event: MouseEvent}>();
}
