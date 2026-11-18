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
