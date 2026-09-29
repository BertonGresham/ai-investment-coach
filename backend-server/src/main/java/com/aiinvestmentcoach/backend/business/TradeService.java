package com.aiinvestmentcoach.backend.business;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import static org.springframework.http.HttpStatus.*;

@Service
public class TradeService {
    public record TradeView(String trade_id,String user_id,String symbol,String analysis_status,String last_error,Instant created_at,JsonNode request) {}
    public record Report(String trade_id,String analysis_mode,Instant created_at,JsonNode result) {}
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final ExecutionRules rules;
    private final AiClient ai;
    public TradeService(JdbcTemplate db,ObjectMapper json,ExecutionRules rules,AiClient ai){this.db=db;this.json=json;this.rules=rules;this.ai=ai;}

    @Transactional
    public TradeView create(String user,String key,TradeApi.Request input) {
        if(key==null || !key.matches("[A-Za-z0-9_-]{8,100}"))throw new ResponseStatusException(BAD_REQUEST,"Provide an Idempotency-Key of 8-100 letters, digits, underscores or hyphens");
        if(input.user_id()!=null && !input.user_id().equals(user))throw new ResponseStatusException(FORBIDDEN,"user_id does not match the authenticated user");
        var ordered=rules.validate(input.trade());
        ObjectNode payload=json.valueToTree(input);
        payload.remove(List.of("user_id","trade_id"));
        if(!payload.hasNonNull("decision"))payload.set("decision",json.createObjectNode());
        String fingerprint=AuthService.hash(payload.toString());
        // Lock only this user's creation requests, so duplicate concurrent submissions share one record.
        db.queryForObject("SELECT id FROM app_users WHERE id=? FOR UPDATE",String.class,user);
        var existing=db.queryForList("SELECT id,request_hash FROM trade_records WHERE user_id=? AND idempotency_key=?",user,key);
        if(!existing.isEmpty()) {
            if(!fingerprint.equals(existing.get(0).get("request_hash")))throw new ResponseStatusException(CONFLICT,"Idempotency-Key already used for different trade data");
            return detail(user,(String)existing.get(0).get("id"));
        }
        String id="trade_"+UUID.randomUUID();
        payload.put("user_id",user);payload.put("trade_id",id);
        Instant now=Instant.now();
        db.update("INSERT INTO trade_records(id,user_id,idempotency_key,request_hash,symbol,request_json,analysis_status,created_at) VALUES(?,?,?,?,?,?,?,?)",
            id,user,key,fingerprint,input.stock().symbol(),payload.toString(),"PENDING",Timestamp.from(now));
        int index=0;
        for(var execution:ordered)db.update("INSERT INTO trade_executions(trade_id,sequence_no,execution_id,side,recorded_time,price,quantity,reason) VALUES(?,?,?,?,?,?,?,?)",
            id,index++,execution.execution_id(),execution.side(),execution.time(),execution.price().toPlainString(),execution.quantity(),execution.reason());
        return detail(user,id);
    }
    public TradeView detail(String user,String id) {
        var rows=db.query("SELECT * FROM trade_records WHERE id=? AND user_id=?",(rs,n)->new TradeView(rs.getString("id"),rs.getString("user_id"),rs.getString("symbol"),
            rs.getString("analysis_status"),rs.getString("last_error"),rs.getTimestamp("created_at").toInstant(),parse(rs.getString("request_json"))),id,user);
        if(rows.isEmpty())throw new ResponseStatusException(NOT_FOUND,"Trade not found");
        return rows.get(0);
    }
    public List<TradeView> list(String user,int offset,int limit) {
        return db.query("SELECT * FROM trade_records WHERE user_id=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?",(rs,n)->new TradeView(rs.getString("id"),rs.getString("user_id"),rs.getString("symbol"),
            rs.getString("analysis_status"),rs.getString("last_error"),rs.getTimestamp("created_at").toInstant(),parse(rs.getString("request_json"))),user,limit,offset);
    }
    @Transactional(noRollbackFor=ResponseStatusException.class)
    public Report analyze(String user,String id) {
        var ids=db.queryForList("SELECT id FROM trade_records WHERE id=? AND user_id=? FOR UPDATE",String.class,id,user);
        if(ids.isEmpty())throw new ResponseStatusException(NOT_FOUND,"Trade not found");
        var cached=reportsForTrade(user,id);
        if(!cached.isEmpty())return cached.get(0);
        TradeView trade=detail(user,id);
        try {
            var result=ai.analyze(trade.request());
            Instant now=Instant.now();
            db.update("INSERT INTO ai_reports(trade_id,user_id,analysis_mode,result_json,created_at) VALUES(?,?,?,?,?)",id,user,result.mode(),result.result().toString(),Timestamp.from(now));
            db.update("UPDATE trade_records SET analysis_status='COMPLETED',last_error=NULL WHERE id=?",id);
            // Return the persisted timestamp precision, identical to subsequent cached reads.
            return report(user,id);
        }catch(ResponseStatusException e){
            db.update("UPDATE trade_records SET analysis_status='FAILED',last_error=? WHERE id=?",e.getReason(),id);
            throw e;
        }
    }
    public Report report(String user,String id) {
        detail(user,id);
        var rows=reportsForTrade(user,id);
        if(rows.isEmpty())throw new ResponseStatusException(NOT_FOUND,"Report not generated yet");
        return rows.get(0);
    }
    public List<Report> reports(String user,int offset,int limit) {
        return db.query("SELECT * FROM ai_reports WHERE user_id=? ORDER BY created_at DESC,trade_id LIMIT ? OFFSET ?",(rs,n)->new Report(rs.getString("trade_id"),rs.getString("analysis_mode"),
            rs.getTimestamp("created_at").toInstant(),parse(rs.getString("result_json"))),user,limit,offset);
    }
    private List<Report> reportsForTrade(String user,String id) {
        return db.query("SELECT * FROM ai_reports WHERE user_id=? AND trade_id=?",(rs,n)->new Report(rs.getString("trade_id"),rs.getString("analysis_mode"),
            rs.getTimestamp("created_at").toInstant(),parse(rs.getString("result_json"))),user,id);
    }
    private JsonNode parse(String text){try{return json.readTree(text);}catch(Exception e){throw new IllegalStateException("Invalid stored JSON",e);}}
}
