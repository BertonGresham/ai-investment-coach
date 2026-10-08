package com.aiinvestmentcoach.backend.business;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.MockMvc;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BackendIntegrationTest {
    static final ObjectMapper JSON=new ObjectMapper();
    static final AtomicInteger calls=new AtomicInteger();
    static volatile int aiStatus=200;
    static final HttpServer fakeAi=startAi();
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired TradeService trades;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry){registry.add("services.ai-service-url",()->"http://127.0.0.1:"+fakeAi.getAddress().getPort());}
    @AfterAll static void stop(){fakeAi.stop(0);}
    @BeforeEach void reset(){aiStatus=200;calls.set(0);}
    static HttpServer startAi(){
        try {
            HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
            server.createContext("/health",e->{byte[] b="{\"analysis_mode\":\"mock\"}".getBytes(StandardCharsets.UTF_8);e.sendResponseHeaders(200,b.length);e.getResponseBody().write(b);e.close();});
            server.createContext("/analyze-trade",e->{
                calls.incrementAndGet();JsonNode request=JSON.readTree(e.getRequestBody());
                ObjectNode result=JSON.createObjectNode();
                result.put("trade_id",request.path("trade_id").asText());result.put("trade_time","2026-09-11T10:00:00-04:00");
                result.put("analysis_type","single_trade_behavior_analysis");result.put("behavior_summary","Contract fixture, not model analysis");
                result.putArray("detected_behavior_problems");result.putArray("personality_tags");result.putArray("coaching_advice");result.putArray("reflection_questions");
                result.put("risk_notice","Test only");result.putObject("uncertainty").put("level","high").put("reason","Fixture");
                byte[] b=JSON.writeValueAsBytes(result);e.getResponseHeaders().add("Content-Type","application/json");e.sendResponseHeaders(aiStatus,b.length);e.getResponseBody().write(b);e.close();
            });server.start();return server;
        }catch(Exception e){throw new IllegalStateException(e);}
    }
    record Account(String token,String id,String email) {}
    Account account() throws Exception {
        String email=UUID.randomUUID()+"@example.com";
        var result=mvc.perform(post("/api/auth/register").contentType("application/json")
            .content(JSON.writeValueAsString(Map.of("username","Young","email",email,"password","Test-password-12345"))))
            .andExpect(status().isCreated()).andReturn();
        JsonNode response=JSON.readTree(result.getResponse().getContentAsString());
        return new Account(response.path("access_token").asText(),response.path("user").path("user_id").asText(),email);
    }
    ObjectNode payload() throws Exception {
        return (ObjectNode)JSON.readTree("""
            {"stock":{"symbol":"AAPL","market":"US"},"trade":{"executions":[
              {"execution_id":"1","side":"buy","time":"2026-09-11T10:00:00-04:00","price":100,"quantity":10},
              {"execution_id":"2","side":"sell","time":"2026-09-14T10:00:00-04:00","price":120,"quantity":5},
              {"execution_id":"3","side":"buy","time":"2026-09-15T10:00:00-04:00","price":80,"quantity":10,"reason":"Revised plan"},
              {"execution_id":"4","side":"sell","time":"2026-09-16T10:00:00-04:00","price":110,"quantity":10}
            ]},"decision":{},"analysis_context":{"language":"zh-CN"}}
            """);
    }
    String create(Account user,String key,ObjectNode payload) throws Exception {
        String result=mvc.perform(post("/api/trades").header("Authorization","Bearer "+user.token()).header("Idempotency-Key",key)
            .contentType("application/json").content(payload.toString())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JSON.readTree(result).path("trade_id").asText();
    }
    @Test void completeFlowPersistsExecutionsAndOneReport() throws Exception {
        Account a=account();String id=create(a,"submission-1",payload());
        String first=mvc.perform(post("/api/trades/"+id+"/analysis").header("Authorization","Bearer "+a.token())).andExpect(status().isOk()).andExpect(jsonPath("$.analysis_mode").value("mock")).andReturn().getResponse().getContentAsString();
        String second=mvc.perform(post("/api/trades/"+id+"/analysis").header("Authorization","Bearer "+a.token())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(JSON.readTree(first),JSON.readTree(second));
        mvc.perform(get("/api/trades/"+id).header("Authorization","Bearer "+a.token())).andExpect(jsonPath("$.analysis_status").value("COMPLETED"));
        mvc.perform(get("/api/reports").header("Authorization","Bearer "+a.token())).andExpect(jsonPath("$.length()").value(1));
        assertEquals(1,calls.get());assertEquals(4,db.queryForObject("SELECT COUNT(*) FROM trade_executions WHERE trade_id=?",Integer.class,id));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM ai_reports WHERE trade_id=?",Integer.class,id));
    }
    @Test void ownerChecksBlockAllRecordAndReportRoutes() throws Exception {
        Account a=account(),b=account();String id=create(a,"submission-2",payload());
        for(String suffix:List.of("","/report"))mvc.perform(get("/api/trades/"+id+suffix).header("Authorization","Bearer "+b.token())).andExpect(status().isNotFound());
        mvc.perform(post("/api/trades/"+id+"/analysis").header("Authorization","Bearer "+b.token())).andExpect(status().isNotFound());
        mvc.perform(get("/api/trades").param("user_id",a.id()).header("Authorization","Bearer "+b.token())).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/trades/"+id)).andExpect(status().isUnauthorized());
        ObjectNode body=payload();body.put("user_id",a.id());
        mvc.perform(post("/api/trades").header("Authorization","Bearer "+b.token()).header("Idempotency-Key","submission-3").contentType("application/json").content(body.toString())).andExpect(status().isForbidden());
        assertEquals(0,calls.get());
    }
    @Test void creationIdempotencyAndConflict() throws Exception {
        Account a=account();String id=create(a,"same-request",payload());assertEquals(id,create(a,"same-request",payload()));
        ObjectNode changed=payload();((ObjectNode)changed.path("stock")).put("symbol","MSFT");
        mvc.perform(post("/api/trades").header("Authorization","Bearer "+a.token()).header("Idempotency-Key","same-request").contentType("application/json").content(changed.toString())).andExpect(status().isConflict());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM trade_records WHERE user_id=?",Integer.class,a.id()));
    }
    @Test void concurrentAnalysisProducesOneHistorySample() throws Exception {
        Account a=account();String id=create(a,"parallel-analysis",payload());
        var pool=Executors.newFixedThreadPool(4);var latch=new CountDownLatch(1);
        try {List<Future<TradeService.Report>> results=new ArrayList<>();
            for(int i=0;i<4;i++)results.add(pool.submit(()->{latch.await();return trades.analyze(a.id(),id);}));latch.countDown();
            for(var result:results)assertEquals(id,result.get(20,TimeUnit.SECONDS).trade_id());
        }finally{pool.shutdownNow();}
        assertEquals(1,calls.get());assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM ai_reports WHERE trade_id=?",Integer.class,id));
    }
    @Test void failedAiCanRetryWithoutLosingTrade() throws Exception {
        Account a=account();String id=create(a,"failure-retry",payload());aiStatus=503;
        mvc.perform(post("/api/trades/"+id+"/analysis").header("Authorization","Bearer "+a.token())).andExpect(status().isBadGateway());
        mvc.perform(get("/api/trades/"+id).header("Authorization","Bearer "+a.token())).andExpect(jsonPath("$.analysis_status").value("FAILED"));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM ai_reports WHERE trade_id=?",Integer.class,id));aiStatus=200;
        mvc.perform(post("/api/trades/"+id+"/analysis").header("Authorization","Bearer "+a.token())).andExpect(status().isOk());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM ai_reports WHERE trade_id=?",Integer.class,id));
    }
    @Test void tradeRulesRejectOversellingDuplicatesAndUnconfirmedDates() throws Exception {
        Account a=account();
        for(String kind:List.of("oversell","duplicate","ambiguous","fraction")) {
            ObjectNode body=payload();var entries=body.path("trade").path("executions");
            if(kind.equals("oversell"))((ObjectNode)entries.get(1)).put("quantity",11);
            if(kind.equals("duplicate"))((ObjectNode)entries.get(1)).put("execution_id","1");
            if(kind.equals("ambiguous")){((ObjectNode)entries.get(0)).put("time","2026-09-11");((ObjectNode)entries.get(1)).put("time","2026-09-11");}
            if(kind.equals("fraction"))((ObjectNode)entries.get(0)).put("quantity",1.5);
            mvc.perform(post("/api/trades").header("Authorization","Bearer "+a.token()).header("Idempotency-Key","invalid-"+kind).contentType("application/json").content(body.toString()))
                .andExpect(status().is(kind.equals("fraction")?400:422));
        }
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM trade_records WHERE user_id=?",Integer.class,a.id()));
    }
    @Test void loginLogoutAndExpiry() throws Exception {
        Account a=account();
        mvc.perform(post("/api/auth/login").contentType("application/json").content(JSON.writeValueAsString(Map.of("email",a.email(),"password","Test-password-12345"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.access_token").exists());
        mvc.perform(post("/api/auth/login").contentType("application/json").content(JSON.writeValueAsString(Map.of("email",a.email(),"password","Wrong-password-12345")))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/logout").header("Authorization","Bearer "+a.token())).andExpect(status().isNoContent());
        mvc.perform(get("/api/me").header("Authorization","Bearer "+a.token())).andExpect(status().isUnauthorized());
        Account b=account();db.update("UPDATE auth_sessions SET expires_at=? WHERE user_id=?",java.sql.Timestamp.from(java.time.Instant.now().minusSeconds(60)),b.id());
        mvc.perform(get("/api/me").header("Authorization","Bearer "+b.token())).andExpect(status().isUnauthorized());
    }
    @Test void unsupportedYearDoesNotPersistAnUnanalyzableTrade() throws Exception {
        Account a=account();ObjectNode body=payload();
        ((ObjectNode)body.path("trade").path("executions").get(0)).put("time","0000-09-11");
        mvc.perform(post("/api/trades").header("Authorization","Bearer "+a.token()).header("Idempotency-Key","invalid-year")
            .contentType("application/json").content(body.toString())).andExpect(status().isUnprocessableEntity());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM trade_records WHERE user_id=?",Integer.class,a.id()));
    }
    @Test void browserCorsAllowsOnlyConfiguredOrigins() throws Exception {
        mvc.perform(options("/api/trades").header("Origin","http://127.0.0.1:5173")
            .header("Access-Control-Request-Method","POST").header("Access-Control-Request-Headers","Authorization,Content-Type,Idempotency-Key"))
            .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","http://127.0.0.1:5173"));
        mvc.perform(options("/api/trades").header("Origin","https://untrusted.example")
            .header("Access-Control-Request-Method","POST")).andExpect(status().isForbidden());
    }
    @Test void historyPaginationAndRefreshUsePersistedRecords() throws Exception {
        Account a=account();create(a,"page-first",payload());create(a,"page-second",payload());
        String path="/api/trades";
        var first=mvc.perform(get(path).param("offset","0").param("limit","1").header("Authorization","Bearer "+a.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1)).andReturn().getResponse().getContentAsString();
        var second=mvc.perform(get(path).param("offset","1").param("limit","1").header("Authorization","Bearer "+a.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1)).andReturn().getResponse().getContentAsString();
        assertNotEquals(JSON.readTree(first).get(0).path("trade_id"),JSON.readTree(second).get(0).path("trade_id"));
        mvc.perform(get(path).param("offset","-1").header("Authorization","Bearer "+a.token())).andExpect(status().isBadRequest());
    }
}
