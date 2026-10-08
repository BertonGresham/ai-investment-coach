package com.aiinvestmentcoach.backend.business;

import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.time.format.DateTimeParseException;
import java.util.*;
import static org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY;
import static com.aiinvestmentcoach.backend.business.TradeApi.*;

/** Matches the ordering and long-only constraints of ai-service/app/trade_times.py. */
@Component
public class ExecutionRules {
    public List<Execution> validate(Trade trade) {
        List<Execution> rows=trade.executions();
        List<String> precisions=rows.stream().map(e->precision(e.time())).toList();
        List<Execution> ordered=new ArrayList<>();
        if(precisions.stream().allMatch("instant"::equals)) {
            ordered.addAll(rows);
            ordered.sort(Comparator.comparing(e->OffsetDateTime.parse(e.time()).toInstant()));
        } else {
            Map<String,List<Execution>> groups=new TreeMap<>();
            for(var row:rows)groups.computeIfAbsent(row.time().substring(0,10),k->new ArrayList<>()).add(row);
            boolean mixed=precisions.contains("instant") && rows.size()>1;
            for(var group:groups.values()) {
                boolean ambiguous=group.size()>1 && group.stream().anyMatch(e->precision(e.time()).equals("date"));
                if((ambiguous || mixed) && !trade.execution_order_confirmed())fail("Confirm execution_order_confirmed when recorded times cannot establish order");
                if(!ambiguous && !mixed)group.sort(Comparator.comparing(Execution::time));
                ordered.addAll(group);
            }
        }
        Set<String> ids=new HashSet<>(),fingerprints=new HashSet<>();
        long held=0,bought=0;
        for(var row:ordered) {
            String time=precision(row.time()).equals("instant")?OffsetDateTime.parse(row.time()).toInstant().toString():row.time();
            String fingerprint=time+"|"+row.side()+"|"+row.price().stripTrailingZeros().toPlainString()+"|"+row.quantity();
            if(!ids.add(row.execution_id()) || !fingerprints.add(fingerprint))fail("Duplicate or indistinguishable executions");
            if(row.side().equals("buy")){held+=row.quantity();bought+=row.quantity();}
            else {if(row.quantity()>held)fail("Sale exceeds the position at that time; short selling is unsupported");held-=row.quantity();}
        }
        if(bought<1 || bought>100000000)fail("Total purchased quantity must be between 1 and 100000000");
        return ordered;
    }
    static String precision(String value) {
        if(value.startsWith("0000-"))fail("Year zero is not a valid recorded trade date");
        if(!value.matches("\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,9})?)?(?:Z|[+-]\\d{2}:\\d{2})?)?"))fail("Use an ISO date or recorded timestamp");
        try {
            if(value.length()==10){LocalDate.parse(value);return "date";}
            if(value.endsWith("Z") || value.substring(10).matches(".*[+-]\\d{2}:\\d{2}$")){OffsetDateTime.parse(value);return "instant";}
            LocalDateTime.parse(value);return "local";
        }catch(DateTimeParseException e){fail("Invalid execution date or timestamp");return "";}
    }
    private static void fail(String message){throw new ResponseStatusException(UNPROCESSABLE_ENTITY,message);}
}
