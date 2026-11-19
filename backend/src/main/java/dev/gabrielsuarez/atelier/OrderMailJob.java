package dev.gabrielsuarez.atelier;

import java.time.Instant;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.*;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name="atelier.mail.dispatch-enabled",havingValue="true",matchIfMissing=true)
public class OrderMailJob {
    private final OrderRepository orders;
    private final OrderMailDispatcher dispatcher;
    public OrderMailJob(OrderRepository orders, OrderMailDispatcher dispatcher) { this.orders=orders;this.dispatcher=dispatcher; }
    @Scheduled(fixedDelayString="${atelier.mail.dispatch-delay:5000}")
    public void deliver() {
        for(Long id:orders.pending(PurchaseOrder.EmailStatus.QUEUED,Instant.now(),PageRequest.of(0,10)))dispatcher.dispatch(id);
    }
}
