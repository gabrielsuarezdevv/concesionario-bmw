package dev.gabrielsuarez.atelier;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:testdb", "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class AtelierApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    private final String selection = "{\"model\":\"m4\",\"paint\":\"green\",\"wheels\":\"forged\",\"interior\":\"cognac\",\"total\":1}";
    @Test void offersM4AndE46AndRejectsRetiredModels() throws Exception {
        mvc.perform(get("/api/catalog")).andExpect(status().isOk())
            .andExpect(jsonPath("$.models.length()").value(2))
            .andExpect(jsonPath("$.models[0].id").value("m4"))
            .andExpect(jsonPath("$.models[1].id").value("e46"));
        for (String retired : new String[]{"m2", "i4"}) {
            mvc.perform(post("/api/quotes").contentType(MediaType.APPLICATION_JSON).content(selection.replace("m4", retired)))
                .andExpect(status().isBadRequest());
        }
    }
    @Test void savesAndQuotesE46UsingItsOwnBasePrice() throws Exception {
        String e46 = selection.replace("m4", "e46");
        mvc.perform(post("/api/quotes").contentType(MediaType.APPLICATION_JSON).content(e46))
            .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(256100));
        String saved = mvc.perform(post("/api/configurations").contentType(MediaType.APPLICATION_JSON).content(e46))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        mvc.perform(get("/api/configurations/" + json.readTree(saved).get("id").asText()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.model").value("e46"))
            .andExpect(jsonPath("$.total").value(256100));
    }
    @Test void computesPriceOnServerIgnoringClientTotal() throws Exception {
        mvc.perform(post("/api/quotes").contentType(MediaType.APPLICATION_JSON).content(selection))
            .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(130600)).andExpect(jsonPath("$.demonstration").value(true));
    }
    @Test void rejectsUnknownOptionsAndIncompleteRequests() throws Exception {
        mvc.perform(post("/api/quotes").contentType(MediaType.APPLICATION_JSON).content(selection.replace("green", "fake"))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/configurations").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
    }
    @Test void savesAndRecoversConfiguration() throws Exception {
        String saved = mvc.perform(post("/api/configurations").contentType(MediaType.APPLICATION_JSON).content(selection))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = json.readTree(saved).get("id").asText();
        mvc.perform(get("/api/configurations/"+id)).andExpect(status().isOk()).andExpect(jsonPath("$.paint").value("green")).andExpect(jsonPath("$.total").value(130600));
        mvc.perform(get("/api/configurations/00000000-0000-0000-0000-000000000000")).andExpect(status().isNotFound());
    }
}
