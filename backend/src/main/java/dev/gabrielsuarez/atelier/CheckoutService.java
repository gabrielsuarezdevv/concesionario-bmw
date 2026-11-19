package dev.gabrielsuarez.atelier;

import java.net.URI;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CheckoutService {
    public record Snapshot(String model, String modelName, String paint, String paintName,
        String wheels, String wheelsName, String interior, String interiorName, int total, String currency) {}
    public record View(UUID id, String checkoutUrl, Instant expiresAt, Snapshot configuration,
        String state, String reference, String emailStatus, String deliveryMode, boolean demonstration) {}
    public record Receipt(String reference, String emailStatus, String deliveryMode, boolean demonstration) {}
    private final CheckoutRepository checkouts;
    private final OrderRepository orders;
    private final CatalogService catalog;
    private final String publicUrl;
    private final OrderMailDispatcher mail;

    public CheckoutService(CheckoutRepository checkouts, OrderRepository orders, CatalogService catalog,
        OrderMailDispatcher mail, @Value("${atelier.checkout.public-url:}") String publicUrl) {
        this.checkouts=checkouts;this.orders=orders;this.catalog=catalog;this.mail=mail;
        this.publicUrl=publicUrl.replaceAll("/+$", "");
        if(!this.publicUrl.isBlank()) {
            URI uri=URI.create(this.publicUrl);
            if(!Set.of("http","https").contains(uri.getScheme()) || uri.getHost()==null
                || uri.getUserInfo()!=null || uri.getQuery()!=null || uri.getFragment()!=null)
                throw new IllegalArgumentException("CHECKOUT_PUBLIC_URL debe ser una URL http(s) sin credenciales, consulta ni fragmento.");
        }
    }
    @Transactional
    public View create(ConfigurationRequest request) {
        int total=catalog.quote(request).total();
        var data=catalog.getCatalog();
        CheckoutSession c=new CheckoutSession();c.id=UUID.randomUUID();
        c.model=request.model();c.paint=request.paint();c.wheels=request.wheels();c.interior=request.interior();
        c.modelName=data.models().stream().filter(m->m.id().equals(c.model)).findFirst().orElseThrow().name();
        c.paintName=name(data.paints(),c.paint);c.wheelsName=name(data.wheels(),c.wheels);c.interiorName=name(data.interiors(),c.interior);
        c.total=total;c.createdAt=Instant.now();c.expiresAt=c.createdAt.plus(Duration.ofMinutes(30));
        return view(checkouts.save(c));
    }
    private String name(List<CatalogService.Option> options, String id) {
        return options.stream().filter(o->o.id().equals(id)).findFirst().orElseThrow().name();
    }
    @Transactional(readOnly=true)
    public View get(UUID id) {
        CheckoutSession c=checkouts.findById(id).orElseThrow(()->error(HttpStatus.NOT_FOUND,"No encontramos este enlace de compra."));
        if(c.orderId==null && !c.expiresAt.isAfter(Instant.now()))throw expired();
        return view(c);
    }
    @Transactional
    public Receipt confirm(UUID id, BuyerRequest buyer) {
        CheckoutSession c=checkouts.lock(id).orElseThrow(()->error(HttpStatus.NOT_FOUND,"No encontramos este enlace de compra."));
        if(buyer.fullName().strip().length()<2)throw error(HttpStatus.BAD_REQUEST,"Introduce tu nombre completo.");
        if(c.orderId!=null) {
            PurchaseOrder existing=orders.findById(c.orderId).orElseThrow();
            // Retrying the same submission after a lost response must not duplicate orders or emails.
            if(existing.customerName.equals(buyer.fullName().strip()) && existing.age==buyer.age()
                && existing.email.equalsIgnoreCase(buyer.email()))return receipt(existing);
            throw error(HttpStatus.CONFLICT,"Este QR ya se ha utilizado para registrar un pedido.");
        }
        if(!c.expiresAt.isAfter(Instant.now()))throw expired();
        PurchaseOrder order=new PurchaseOrder();order.checkoutId=c.id;
        order.customerName=buyer.fullName().strip();order.age=buyer.age();order.email=buyer.email();
        order.createdAt=Instant.now();order.emailStatus=PurchaseOrder.EmailStatus.QUEUED;order.nextEmailAttempt=order.createdAt;
        orders.saveAndFlush(order);c.orderId=order.id;
        return receipt(order);
    }
    private Receipt receipt(PurchaseOrder order) {
        return new Receipt(order.reference(),order.emailStatus.name(),mail.mode(),true);
    }
    private View view(CheckoutSession c) {
        PurchaseOrder o=c.orderId==null?null:orders.findById(c.orderId).orElseThrow();
        return new View(c.id,publicUrl+"/?checkout="+c.id,c.expiresAt,
            new Snapshot(c.model,c.modelName,c.paint,c.paintName,c.wheels,c.wheelsName,c.interior,c.interiorName,c.total,"EUR"),
            o==null?"OPEN":"COMPLETED",o==null?null:o.reference(),o==null?null:o.emailStatus.name(),mail.mode(),true);
    }
    private ResponseStatusException expired() { return error(HttpStatus.GONE,"Este QR ha caducado. Genera uno nuevo desde tu configuración."); }
    private ResponseStatusException error(HttpStatus status, String message) { return new ResponseStatusException(status,message); }
}
