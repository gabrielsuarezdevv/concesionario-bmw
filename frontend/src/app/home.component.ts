import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, input, output, signal } from '@angular/core';

type Highlight = {id:string; name:string; statement:string; character:string};

@Component({
  selector: 'atelier-home',
  standalone: true,
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements AfterViewInit, OnDestroy {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private revealObserver?: IntersectionObserver;
  private transitionTimer?: ReturnType<typeof setTimeout>;
  private previewRequest = 0;
  readonly modelCount = input(6);
  readonly visit = output<{section: string; event: MouseEvent}>();
  readonly highlights = [
    {id:'m2', name:'M2 G87', statement:'Toda la esencia M.', character:'Compacto. Intenso. Inconfundible.'},
    {id:'m4', name:'M4 Competition', statement:'La expresión del carácter.', character:'Una presencia que se siente.'},
    {id:'f82', name:'M4 F82', statement:'Una silueta que marca época.', character:'Diseño que deja huella.'}
  ];
  readonly highlighted = signal(0);
  readonly featured = computed(()=>this.highlights[this.highlighted()]);
  readonly previousFeatured = signal<Highlight|null>(null);
  readonly pendingHighlight = signal<number|null>(null);

  async showHighlight(index:number) {
    if(!this.highlights[index])return;
    const request=++this.previewRequest;
    this.pendingHighlight.set(index);
    if(index===this.highlighted()){this.pendingHighlight.set(null);return;}
    // Decode first so the crossfade never exposes an empty image on a slow connection.
    const image=new Image();
    image.src='models/previews/'+this.highlights[index].id+'.png';
    try { await image.decode(); }
    catch { if(request===this.previewRequest)this.pendingHighlight.set(null);return; }
    if(request!==this.previewRequest)return;
    clearTimeout(this.transitionTimer);
    this.previousFeatured.set(this.featured());
    this.highlighted.set(index);
    this.pendingHighlight.set(null);
    this.transitionTimer=setTimeout(()=>this.previousFeatured.set(null),700);
  }

  ngAfterViewInit() {
    if(!('IntersectionObserver' in window)||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    this.revealObserver=new IntersectionObserver(entries=>{
      for(const entry of entries) {
        if(!entry.isIntersecting)continue;
        entry.target.classList.add('is-revealed');
        this.revealObserver?.unobserve(entry.target);
      }
    },{threshold:.08,rootMargin:'0px 0px -24px 0px'});
    this.element.nativeElement.querySelectorAll<HTMLElement>('[data-home-reveal]').forEach(element=>{
      element.classList.add('reveal-ready');
      this.revealObserver!.observe(element);
    });
  }

  ngOnDestroy() {
    ++this.previewRequest;
    clearTimeout(this.transitionTimer);
    this.revealObserver?.disconnect();
  }
}
