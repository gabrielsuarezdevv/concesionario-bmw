package dev.gabrielsuarez.atelier;

import jakarta.mail.internet.MimeMessage;
import java.io.*;
import java.nio.file.*;
import java.text.NumberFormat;
import java.time.Instant;
import java.util.Locale;
import org.slf4j.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderMailDispatcher {
    private static final Logger log=LoggerFactory.getLogger(OrderMailDispatcher.class);
    private final OrderRepository orders;
    private final CheckoutRepository checkouts;
    private final JavaMailSender sender;
    private final String mode;
    private final String from;
    private final Path previewDirectory;
    public OrderMailDispatcher(OrderRepository orders, CheckoutRepository checkouts, JavaMailSender sender,
        @Value("${atelier.mail.mode:preview}") String mode, @Value("${atelier.mail.from:pedidos@bmw-atelier.test}") String from,
        @Value("${atelier.mail.preview-directory:./data/mail-preview}") String previewDirectory) {
        this.orders=orders;this.checkouts=checkouts;this.sender=sender;this.mode=mode.toUpperCase(Locale.ROOT);this.from=from;
        this.previewDirectory=Path.of(previewDirectory);
        if(!this.mode.equals("SMTP") && !this.mode.equals("PREVIEW"))throw new IllegalArgumentException("ORDER_MAIL_MODE debe ser preview o smtp.");
    }
    public String mode() { return mode; }
    @Transactional
    public void dispatch(Long id) {
        PurchaseOrder order=orders.lock(id).orElseThrow();
        if(order.emailStatus!=PurchaseOrder.EmailStatus.QUEUED || order.nextEmailAttempt.isAfter(Instant.now()))return;
        order.emailAttempts++;
        try {
            CheckoutSession c=checkouts.findById(order.checkoutId).orElseThrow();
            MimeMessage message=sender.createMimeMessage();
            MimeMessageHelper helper=new MimeMessageHelper(message,false,"UTF-8");
            helper.setFrom(from,"BMW Atelier");helper.setTo(order.email);
            helper.setSubject("Confirmación de pedido "+order.reference()+" · BMW Atelier");
            String price=NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-ES")).format(c.total);
            helper.setText("Hola, "+order.customerName+":\n\nHemos registrado tu pedido de demostración "+order.reference()+".\n\n"
                +"Tu BMW "+c.modelName+"\nPintura: "+c.paintName+"\nLlantas: "+c.wheelsName+"\nInterior: "+c.interiorName
                +"\nImporte de referencia: "+price+"\n\nFecha: "+order.createdAt+"\n\n"
                +"Este pedido pertenece a una demostración. No se ha realizado ningún cobro ni una compraventa real.\n\n"
                +"BMW Atelier\nEl placer de hacerlo tuyo.\nProyecto independiente, sin afiliación con BMW AG.",false);
            if(mode.equals("SMTP")) {
                sender.send(message);order.emailStatus=PurchaseOrder.EmailStatus.SENT;order.emailSentAt=Instant.now();
            } else {
                Files.createDirectories(previewDirectory);
                Path target=previewDirectory.resolve(order.reference()+".eml");
                try(OutputStream output=Files.newOutputStream(target)) { message.writeTo(output); }
                order.emailStatus=PurchaseOrder.EmailStatus.PREVIEW;
            }
            order.nextEmailAttempt=null;
        } catch(Exception exception) {
            // Keep the order even when SMTP is unavailable. Retry up to five times from the outbox.
            order.emailStatus=order.emailAttempts>=5?PurchaseOrder.EmailStatus.FAILED:PurchaseOrder.EmailStatus.QUEUED;
            order.nextEmailAttempt=order.emailAttempts>=5?null:Instant.now().plusSeconds(60L*order.emailAttempts);
            log.warn("Confirmación de pedido {} pendiente, intento {} ({})",order.reference(),order.emailAttempts,exception.getClass().getSimpleName());
        }
    }
}
