package dev.gabrielsuarez.atelier;

import com.fasterxml.jackson.databind.*;
import jakarta.mail.*;
import jakarta.mail.internet.MimeMessage;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:checkouttests", "spring.jpa.hibernate.ddl-auto=create-drop",
    "atelier.checkout.public-url=http://192.168.1.10:4300", "atelier.mail.mode=preview",
    "atelier.mail.preview-directory=./target/test-mail", "atelier.mail.dispatch-enabled=false"})
@AutoConfigureMockMvc
class CheckoutApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired CheckoutRepository checkouts;
    @Autowired OrderRepository orders;
    @Autowired OrderMailDispatcher mail;
    private final String selection="{\"model\":\"e92\",\"paint\":\"green\",\"wheels\":\"forged\",\"interior\":\"cognac\",\"total\":1}";
    private final String buyer="{\"fullName\":\"Cliente de prueba\",\"age\":18,\"email\":\"prueba@example.test\"}";
    @BeforeEach void reset() { orders.deleteAll();checkouts.deleteAll(); }
    private JsonNode create() throws Exception {
        return json.readTree(mvc.perform(post("/api/checkouts").contentType(MediaType.APPLICATION_JSON).content(selection))
            .andExpect(status().isCreated()).andExpect(header().string("Cache-Control","no-store")).andReturn().getResponse().getContentAsString());
    }
    @Test void freezesServerQuoteAndCreatesReachableQrLink() throws Exception {
        JsonNode view=create();String id=view.get("id").asText();
        assertEquals("http://192.168.1.10:4300/?checkout="+id,view.get("checkoutUrl").asText());
        assertEquals(64100,view.at("/configuration/total").asInt());
        assertEquals("M3 E92",view.at("/configuration/modelName").asText());
        assertEquals("Isle of Man Green",view.at("/configuration/paintName").asText());
        assertTrue(Instant.parse(view.get("expiresAt").asText()).isAfter(Instant.now().plusSeconds(1700)));
        mvc.perform(get("/api/checkouts/"+id)).andExpect(status().isOk())
            .andExpect(jsonPath("$.state").value("OPEN")).andExpect(jsonPath("$.configuration.wheels").value("forged"));
    }
    @Test void rejectsMinorsInvalidAndMissingFieldsOnServer() throws Exception {
        String id=create().get("id").asText();
        for(String invalid:List.of(buyer.replace(":18",":17"),buyer.replace(":18",":18.5"),buyer.replace(":18",":null"),
            buyer.replace(":18",":121"),buyer.replace("Cliente de prueba"," "),buyer.replace("prueba@example.test","correo-invalido"))) {
            mvc.perform(post("/api/checkouts/"+id+"/orders").contentType(MediaType.APPLICATION_JSON).content(invalid)).andExpect(status().isBadRequest());
        }
        assertEquals(0,orders.count());
    }
    @Test void acceptsAge18AndNeverDuplicatesOrderOrExposesBuyerInQrView() throws Exception {
        String id=create().get("id").asText();
        String first=mvc.perform(post("/api/checkouts/"+id+"/orders").contentType(MediaType.APPLICATION_JSON).content(buyer))
            .andExpect(status().isOk()).andExpect(jsonPath("$.emailStatus").value("QUEUED")).andReturn().getResponse().getContentAsString();
        String repeat=mvc.perform(post("/api/checkouts/"+id+"/orders").contentType(MediaType.APPLICATION_JSON).content(buyer))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(json.readTree(first).get("reference"),json.readTree(repeat).get("reference"));assertEquals(1,orders.count());
        mvc.perform(post("/api/checkouts/"+id+"/orders").contentType(MediaType.APPLICATION_JSON).content(buyer.replace("prueba@example.test","otro@example.test")))
            .andExpect(status().isConflict());
        String publicView=mvc.perform(get("/api/checkouts/"+id)).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("COMPLETED"))
            .andReturn().getResponse().getContentAsString();
        assertFalse(publicView.contains("Cliente de prueba"));assertFalse(publicView.contains("prueba@example.test"));
        assertFalse(json.readTree(publicView).has("age"));assertFalse(json.readTree(publicView).has("email"));
    }
    @Test void rejectsExpiredUnknownAndMalformedTokens() throws Exception {
        UUID id=UUID.fromString(create().get("id").asText());
        CheckoutSession c=checkouts.findById(id).orElseThrow();c.expiresAt=Instant.now().minusSeconds(1);checkouts.saveAndFlush(c);
        mvc.perform(get("/api/checkouts/"+id)).andExpect(status().isGone());
        mvc.perform(post("/api/checkouts/"+id+"/orders").contentType(MediaType.APPLICATION_JSON).content(buyer)).andExpect(status().isGone());
        mvc.perform(get("/api/checkouts/"+UUID.randomUUID())).andExpect(status().isNotFound());
        mvc.perform(get("/api/checkouts/not-a-token")).andExpect(status().isBadRequest());assertEquals(0,orders.count());
    }
    @Test void preparesActualMimeConfirmationInPreviewMode() throws Exception {
        String id=create().get("id").asText();
        mvc.perform(post("/api/checkouts/"+id+"/orders").contentType(MediaType.APPLICATION_JSON).content(buyer)).andExpect(status().isOk());
        PurchaseOrder order=orders.findAll().getFirst();mail.dispatch(order.id);
        assertEquals(PurchaseOrder.EmailStatus.PREVIEW,orders.findById(order.id).orElseThrow().emailStatus);
        try(var input=Files.newInputStream(Path.of("target/test-mail/"+order.reference()+".eml"))) {
            MimeMessage message=new MimeMessage(Session.getInstance(new Properties()),input);
            assertTrue(message.getSubject().contains(order.reference()));assertEquals("prueba@example.test",message.getAllRecipients()[0].toString());
            String text=message.getContent().toString();assertTrue(text.contains("M3 E92"));assertTrue(text.contains("Isle of Man Green"));
            assertTrue(text.contains("64.100"));assertTrue(text.contains("Cliente de prueba"));assertFalse(text.contains("18 años"));
        }
    }
    @Test void simultaneousSubmissionsCreateOnlyOneOrder() throws Exception {
        String id=create().get("id").asText();
        try(ExecutorService executor=Executors.newFixedThreadPool(2)) {
            Callable<String> submit=()->mvc.perform(post("/api/checkouts/"+id+"/orders").contentType(MediaType.APPLICATION_JSON).content(buyer))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            var results=executor.invokeAll(List.of(submit,submit));
            assertEquals(json.readTree(results.get(0).get()).get("reference"),json.readTree(results.get(1).get()).get("reference"));
        }
        assertEquals(1,orders.count());
    }
    @Test void rejectsUnknownCarOrOptionsBeforeCreatingCheckout() throws Exception {
        mvc.perform(post("/api/checkouts").contentType(MediaType.APPLICATION_JSON).content(selection.replace("e92","fake"))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/checkouts").contentType(MediaType.APPLICATION_JSON).content(selection.replace("green","fake"))).andExpect(status().isBadRequest());
        assertEquals(0,checkouts.count());
    }
}
