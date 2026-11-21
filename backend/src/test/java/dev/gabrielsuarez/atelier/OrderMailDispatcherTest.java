package dev.gabrielsuarez.atelier;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.time.Instant;
import java.util.Properties;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:smtptests", "spring.jpa.hibernate.ddl-auto=create-drop",
    "atelier.mail.mode=smtp", "atelier.mail.dispatch-enabled=false"})
class OrderMailDispatcherTest {
    @Autowired CheckoutService checkout;
    @Autowired OrderRepository orders;
    @Autowired CheckoutRepository checkouts;
    @Autowired OrderMailDispatcher dispatcher;
    @MockitoBean JavaMailSender sender;
    @BeforeEach void prepare() {
        orders.deleteAll();checkouts.deleteAll();reset(sender);
        when(sender.createMimeMessage()).thenAnswer(invocation->new MimeMessage(Session.getInstance(new Properties())));
    }
    private PurchaseOrder order() {
        var view=checkout.create(new ConfigurationRequest("e92","blue","sport","black"));
        checkout.confirm(view.id(),new BuyerRequest("Cliente de prueba",18,"prueba@example.test"));
        return orders.findAll().getFirst();
    }
    @Test void retriesSmtpFailureWithoutLosingOrDuplicatingOrder() throws Exception {
        PurchaseOrder order=order();
        doThrow(new MailSendException("Temporary SMTP failure")).doNothing().when(sender).send(any(MimeMessage.class));
        dispatcher.dispatch(order.id);
        PurchaseOrder pending=orders.findById(order.id).orElseThrow();
        assertEquals(PurchaseOrder.EmailStatus.QUEUED,pending.emailStatus);assertEquals(1,pending.emailAttempts);assertEquals(1,orders.count());
        assertEquals("COMPLETED",checkout.get(order.checkoutId).state());
        pending.nextEmailAttempt=Instant.now().minusSeconds(1);orders.saveAndFlush(pending);dispatcher.dispatch(order.id);
        assertEquals(PurchaseOrder.EmailStatus.SENT,orders.findById(order.id).orElseThrow().emailStatus);
        dispatcher.dispatch(order.id);
        var captured=ArgumentCaptor.forClass(MimeMessage.class);verify(sender,times(2)).send(captured.capture());
        MimeMessage message=captured.getValue();assertEquals("prueba@example.test",message.getAllRecipients()[0].toString());
        assertTrue(message.getContent().toString().contains("M3 E92"));assertTrue(message.getContent().toString().contains("58.000"));
    }
    @Test void recordsFinalDeliveryFailureWithoutCancelingPurchase() {
        PurchaseOrder order=order();order.emailAttempts=4;order.nextEmailAttempt=Instant.now().minusSeconds(1);orders.saveAndFlush(order);
        doThrow(new MailSendException("SMTP unavailable")).when(sender).send(any(MimeMessage.class));
        dispatcher.dispatch(order.id);
        PurchaseOrder failed=orders.findById(order.id).orElseThrow();assertEquals(PurchaseOrder.EmailStatus.FAILED,failed.emailStatus);
        assertEquals(5,failed.emailAttempts);assertNull(failed.nextEmailAttempt);assertEquals(1,orders.count());
        dispatcher.dispatch(order.id);verify(sender,times(1)).send(any(MimeMessage.class));
    }
}
