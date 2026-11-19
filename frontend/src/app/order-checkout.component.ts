import { Component, Input, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { timeout } from 'rxjs';
import { CheckoutView, OrderReceipt, orderEmailMessage } from './checkout';

@Component({
  selector: 'order-checkout', standalone: true, imports: [ReactiveFormsModule, CurrencyPipe, DatePipe],
  templateUrl: './order-checkout.component.html'
})
export class OrderCheckoutComponent implements OnInit, OnDestroy {
  @Input({ required: true }) token = '';
  private http = inject(HttpClient);
  checkout = signal<CheckoutView | null>(null);
  loading = signal(true); submitting = signal(false); error = signal('');
  fieldErrors = signal<Record<string, string>>({});
  readonly emailMessage = orderEmailMessage;
  private poll?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  form = new FormGroup({
    fullName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)] }),
    age: new FormControl<number | null>(null, [Validators.required, Validators.min(18), Validators.max(120), Validators.pattern(/^[0-9]+$/)]),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(254)] })
  });
  ngOnInit() { this.load(); }
  load() {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.token)) {
      this.loading.set(false); this.error.set('El enlace de compra no es válido.'); return;
    }
    this.loading.set(true); this.error.set('');
    this.http.get<CheckoutView>('/api/checkouts/' + this.token).pipe(timeout(10000)).subscribe({
      next: view => { this.checkout.set(view); this.loading.set(false); if (view.state === 'COMPLETED') this.schedulePoll(); },
      error: response => { this.loading.set(false); this.error.set(response.error?.message || 'No se ha podido abrir el pedido. Comprueba tu conexión e inténtalo de nuevo.'); }
    });
  }
  fieldError(name: 'fullName' | 'age' | 'email'): string {
    if (this.fieldErrors()[name]) return this.fieldErrors()[name];
    const control = this.form.controls[name];
    if (!control.touched || !control.invalid) return '';
    if (name === 'age') return control.hasError('min') ? 'Debes tener 18 años o más para realizar el pedido.' : 'Introduce tu edad en años completos (entre 18 y 120).';
    if (name === 'email') return 'Introduce un correo electrónico válido.';
    return 'Introduce tu nombre completo (entre 2 y 120 caracteres).';
  }
  submit() {
    if (this.submitting() || this.checkout()?.state !== 'OPEN') return;
    this.form.controls.fullName.setValue(this.form.controls.fullName.value.trim());
    this.form.controls.email.setValue(this.form.controls.email.value.trim());
    this.fieldErrors.set({}); this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.submitting.set(true); this.error.set('');
    this.http.post<OrderReceipt>('/api/checkouts/' + this.token + '/orders', this.form.getRawValue()).pipe(timeout(15000)).subscribe({
      next: receipt => {
        this.submitting.set(false);
        this.checkout.update(view => view ? { ...view, state: 'COMPLETED', reference: receipt.reference, emailStatus: receipt.emailStatus, deliveryMode: receipt.deliveryMode } : view);
        this.schedulePoll();
      },
      error: response => {
        this.submitting.set(false); this.fieldErrors.set(response.error?.fields || {});
        this.error.set(response.error?.message || 'No hemos podido confirmar el resultado. Puedes volver a intentarlo: no se duplicará el pedido.');
        if (response.status === 409 || response.status === 410) this.load();
      }
    });
  }
  private schedulePoll() {
    clearTimeout(this.poll);
    if (this.destroyed || this.checkout()?.emailStatus !== 'QUEUED') return;
    this.poll = setTimeout(() => {
      this.http.get<CheckoutView>('/api/checkouts/' + this.token).pipe(timeout(7000)).subscribe({
        next: view => { if (!this.destroyed) { this.checkout.set(view); this.schedulePoll(); } },
        error: () => this.schedulePoll()
      });
    }, 2500);
  }
  ngOnDestroy() { this.destroyed = true; clearTimeout(this.poll); }
}
