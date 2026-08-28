package com.soportia.auth;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthApiIntegrationTest {
    @Autowired MockMvc mvc;

    @Test void loginRefreshAndRoleAuthorizationWork() throws Exception {
        var login=mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"employee@soportia.local\",\"password\":\"Demo123!\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.accessToken").isString())
                .andExpect(cookie().httpOnly("refresh_token",true)).andReturn();
        Cookie refresh=login.getResponse().getCookie("refresh_token");
        String token=JsonPath.read(login.getResponse().getContentAsString(),"$.accessToken");
        mvc.perform(post("/api/v1/auth/refresh").cookie(refresh))
                .andExpect(status().isOk()).andExpect(jsonPath("$.accessToken").isString());
        mvc.perform(get("/api/v1/audit").header("Authorization","Bearer "+token)).andExpect(status().isForbidden());
    }

    @Test void rejectsInvalidCredentials() throws Exception {
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"employee@soportia.local\",\"password\":\"wrong\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test void rateLimitsRepeatedLoginFailures() throws Exception {
        for(int attempt=0;attempt<5;attempt++){
            mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"locked@example.com\",\"password\":\"wrong\"}"))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"locked@example.com\",\"password\":\"wrong\"}"))
                .andExpect(status().isTooManyRequests());
    }

    @Test void employeeCanCreateAndListOwnTicket() throws Exception {
        var login=mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"employee@soportia.local\",\"password\":\"Demo123!\"}"))
                .andReturn();
        String token=JsonPath.read(login.getResponse().getContentAsString(),"$.accessToken");
        mvc.perform(post("/api/v1/tickets").header("Authorization","Bearer "+token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"VPN is unavailable","description":"Connection fails from home",
                                "impact":2,"urgency":3,"categoryId":"30000000-0000-0000-0000-000000000001"}
                                """))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.number").isString())
                .andExpect(jsonPath("$.priority").value("HIGH"));
        mvc.perform(get("/api/v1/tickets").header("Authorization","Bearer "+token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").isNumber());
    }

    @Test void completeTicketLifecycleRespectsRolesAndVisibility() throws Exception {
        String employee=token("employee@soportia.local");
        var created=mvc.perform(post("/api/v1/tickets").header("Authorization","Bearer "+employee)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Lifecycle acceptance","description":"End-to-end local verification",
                                "impact":3,"urgency":3,"categoryId":"30000000-0000-0000-0000-000000000001"}
                                """))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.priority").value("CRITICAL")).andReturn();
        String id=JsonPath.read(created.getResponse().getContentAsString(),"$.id");

        mvc.perform(post("/api/v1/tickets/"+id+"/comments").header("Authorization","Bearer "+employee)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"must stay public\",\"visibility\":\"INTERNAL\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/tickets/"+id+"/comments").header("Authorization","Bearer "+employee)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"too early\",\"visibility\":\"PUBLIC\"}"))
                .andExpect(status().isConflict());

        String agent=token("agent@soportia.local");
        mvc.perform(post("/api/v1/tickets/"+id+"/take").header("Authorization","Bearer "+agent)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk());
        transition(id,agent,"IN_PROGRESS",200);
        mvc.perform(post("/api/v1/tickets/"+id+"/comments").header("Authorization","Bearer "+agent)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"private diagnosis\",\"visibility\":\"INTERNAL\"}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/v1/tickets/"+id+"/comments").header("Authorization","Bearer "+agent)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"public first response\",\"visibility\":\"PUBLIC\"}"))
                .andExpect(status().isCreated());
        transition(id,agent,"RESOLVED",200);
        transition(id,employee,"CLOSED",200);

        mvc.perform(get("/api/v1/tickets/"+id).header("Authorization","Bearer "+employee))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CLOSED"))
                .andExpect(jsonPath("$.comments.length()").value(1));
    }

    private String token(String email) throws Exception {
        var login=mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\""+email+"\",\"password\":\"Demo123!\"}"))
                .andExpect(status().isOk()).andReturn();
        return JsonPath.read(login.getResponse().getContentAsString(),"$.accessToken");
    }

    private void transition(String id,String token,String status,int expected) throws Exception {
        mvc.perform(post("/api/v1/tickets/"+id+"/transition").header("Authorization","Bearer "+token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\""+status+"\"}"))
                .andExpect(status().is(expected));
    }
}
