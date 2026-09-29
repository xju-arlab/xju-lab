package org.xjuarlab.lab.api;

import java.util.List;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

public record PageEnvelope<T>(List<T> items,long total,int page,int pageSize) {
    public static long offset(int page,int pageSize){
        if(page<1||page>1_000_000||pageSize<1||pageSize>100)throw new ResponseStatusException(BAD_REQUEST,"分页参数超出范围");
        return (long)(page-1)*pageSize;
    }
}
