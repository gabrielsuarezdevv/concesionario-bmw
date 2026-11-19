export interface CheckoutConfiguration {
  model: string; modelName: string; paint: string; paintName: string;
  wheels: string; wheelsName: string; interior: string; interiorName: string;
  total: number; currency: string;
}
export interface CheckoutView {
  id: string; checkoutUrl: string; expiresAt: string; configuration: CheckoutConfiguration;
  state: 'OPEN' | 'COMPLETED'; reference: string | null;
  emailStatus: 'QUEUED' | 'SENT' | 'PREVIEW' | 'FAILED' | null;
  deliveryMode: 'SMTP' | 'PREVIEW'; demonstration: boolean;
}
export interface OrderReceipt {
  reference: string; emailStatus: CheckoutView['emailStatus']; deliveryMode: CheckoutView['deliveryMode']; demonstration: boolean;
}
export function orderEmailMessage(status: CheckoutView['emailStatus']): string {
  switch (status) {
    case 'SENT': return 'Hemos enviado el email de confirmación del pedido.';
    case 'PREVIEW': return 'Confirmación preparada en modo de demostración. No se ha enviado un correo real.';
    case 'FAILED': return 'El pedido está registrado, pero no hemos podido enviar el correo de confirmación.';
    default: return 'Estamos preparando el email de confirmación de tu pedido.';
  }
}
