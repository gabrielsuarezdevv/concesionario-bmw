import { Component, computed, input, output, signal } from '@angular/core';

@Component({
  selector: 'atelier-home',
  standalone: true,
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  readonly modelCount = input(6);
  readonly visit = output<{section: string; event: MouseEvent}>();
  readonly highlights = [
    {id:'m2', name:'M2 G87', statement:'Toda la esencia M.', character:'Compacto. Intenso. Inconfundible.'},
    {id:'m4', name:'M4 Competition', statement:'La expresión del carácter.', character:'Una presencia que se siente.'},
    {id:'f82', name:'M4 F82', statement:'Una silueta que marca época.', character:'Diseño que deja huella.'}
  ];
  readonly highlighted = signal(0);
  readonly featured = computed(()=>this.highlights[this.highlighted()]);
}
