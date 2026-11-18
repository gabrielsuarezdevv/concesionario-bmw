import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CurrencyPipe } from '@angular/common';
import { timeout } from 'rxjs';
import { CarViewerComponent } from './car-viewer.component';
import { Catalog, DEMO_CATALOG, Option } from './catalog';

@Component({ selector: 'app-root', standalone: true, imports: [CarViewerComponent, CurrencyPipe], templateUrl: './app.component.html' })
export class AppComponent {
  @ViewChild('summary') summary!: ElementRef<HTMLDialogElement>;
  private http=inject(HttpClient);
  catalog=signal<Catalog>(DEMO_CATALOG);
  model=signal('m4'); paint=signal('blue'); wheels=signal('sport'); interior=signal('black');
  activePart=signal('paint'); view=signal('exterior'); exploded=signal(false); autoRotate=signal(false); resetKey=signal(0);
  apiOnline=signal(false); saving=signal(false); toast=signal(''); saved=signal(false); help=signal(false);
  private toastTimer?: ReturnType<typeof setTimeout>;
  car=computed(()=>this.catalog().models.find(m=>m.id===this.model())!);
  selectedPaint=computed(()=>this.catalog().paints.find(p=>p.id===this.paint())!);
  selectedWheels=computed(()=>this.catalog().wheels.find(p=>p.id===this.wheels())!);
  selectedInterior=computed(()=>this.catalog().interiors.find(p=>p.id===this.interior())!);
  total=computed(()=>this.car().price+this.selectedPaint().price+this.selectedWheels().price+this.selectedInterior().price);
  partTitle=computed(()=>({paint:'Carrocería y pintura',wheels:'Llantas y frenos',interior:'Habitáculo y tapicería'}[this.activePart()]));
  constructor() {
    const query=new URLSearchParams(location.search);
    const shared=query.has('model');
    let selection: Record<string,string>={};
    try { selection=shared?Object.fromEntries(query):JSON.parse(localStorage.getItem('atelier.configuration')||'{}'); } catch { /* Storage may be unavailable. */ }
    this.restore(selection);
    this.http.get<Catalog>('/api/catalog').pipe(timeout(4000)).subscribe({next:data=>{this.catalog.set(data);if(!data.models.some(m=>m.id===this.model()))this.model.set(data.models[0].id);this.apiOnline.set(true);},error:()=>this.apiOnline.set(false)});
  }
  private restore(s:Record<string,string>) {
    if(!s || typeof s!=='object')return;
    const c=this.catalog();
    if(c.models.some(x=>x.id===s['model']))this.model.set(s['model']);
    if(c.paints.some(x=>x.id===s['paint']))this.paint.set(s['paint']);
    if(c.wheels.some(x=>x.id===s['wheels']))this.wheels.set(s['wheels']);
    if(c.interiors.some(x=>x.id===s['interior']))this.interior.set(s['interior']);
  }
  selectPart(part:string) { this.activePart.set(part); if(part!=='interior' && this.view()==='interior') this.view.set('exterior'); }
  choose(type:string,id:string) {
    if(type==='paint')this.paint.set(id);
    if(type==='wheels')this.wheels.set(id);
    if(type==='interior')this.interior.set(id);
    this.activePart.set(type);
    this.saved.set(false);
  }
  chooseModel(id:string) { if(!this.catalog().models.some(m=>m.id===id))return;this.model.set(id);this.saved.set(false);this.reset(); document.getElementById('configurador')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}); }
  setView(view:string) { this.view.set(view); if(view==='interior'){this.exploded.set(false);this.autoRotate.set(false);this.activePart.set('interior');} }
  toggleExploded() { this.view.set('exterior'); this.exploded.update(v=>!v); }
  reset() { this.view.set('exterior');this.exploded.set(false);this.autoRotate.set(false);this.resetKey.update(v=>v+1); }
  navigate(section:string,event:MouseEvent) {
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;
    event.preventDefault();
    const url=new URL(location.href);url.hash=section;history.pushState(null,'',url);
    const behavior=window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
    if(section)document.getElementById(section)?.scrollIntoView({behavior});else window.scrollTo({top:0,behavior});
  }
  openSummary() { this.summary.nativeElement.showModal(); }
  selection() { return {model:this.model(),paint:this.paint(),wheels:this.wheels(),interior:this.interior()}; }
  notify(text:string) { clearTimeout(this.toastTimer);this.toast.set(text);this.toastTimer=setTimeout(()=>this.toast.set(''),6500); }
  save() {
    if(this.saving())return; this.saving.set(true);const selection=this.selection();
    const unchanged=()=>JSON.stringify(selection)===JSON.stringify(this.selection());
    this.http.post<{id:string;total:number}>('/api/configurations',selection).pipe(timeout(6000)).subscribe({
      next:()=>{this.apiOnline.set(true);this.persistLocal(selection);this.saved.set(unchanged());this.saving.set(false);this.notify('Tu configuración se ha guardado en el servidor.');},
      error:()=>{this.apiOnline.set(false);const stored=this.persistLocal(selection);this.saved.set(stored&&unchanged());this.saving.set(false);this.notify(stored?'Servidor no disponible. Configuración guardada solo en este navegador.':'No se ha podido guardar. Puedes descargar tu configuración.');}
    });
  }
  private persistLocal(selection:Record<string,string>):boolean { try {localStorage.setItem('atelier.configuration',JSON.stringify(selection));return true;}catch{return false;} }
  async share() {
    const url=new URL(location.href);url.search=new URLSearchParams(this.selection()).toString();url.hash='configurador';
    try {await navigator.clipboard.writeText(url.toString());this.notify('Enlace de tu configuración copiado.');}
    catch {this.notify('No se pudo copiar. Descarga la configuración desde el resumen.');}
  }
  download() {
    const blob=new Blob([JSON.stringify({ ...this.selection(),modelName:this.car().name,estimatedTotal:this.total(),currency:'EUR',demonstration:true },null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download='mi-bmw-configuracion.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  optionPrice(option:Option) { return option.price===0?'Incluido':'+ '+new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(option.price); }
}
