package org.xjuarlab.lab.collaboration.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.Map;
import java.util.Set;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

final class ProjectResources {
    private static final ObjectMapper JSON=new ObjectMapper();
    private static final Map<String,Set<String>> HOSTS=Map.of("github",Set.of("github.com","www.github.com"),"huggingFace",Set.of("huggingface.co","www.huggingface.co"));
    private static final Set<String> BAIDU_KEYS=Set.of("deliverables","sources","documents","video");
    static String mode(String value) {
        String result=value==null?"GITHUB":value;
        if(!Set.of("GITHUB","BAIDU").contains(result)) throw new ResponseStatusException(BAD_REQUEST,"项目资源类型无效");
        return result;
    }
    static String validate(String mode,Map<String,String> links) {
        var result=JSON.createObjectNode();
        if(links==null)return result.toString();
        var keys=mode.equals("GITHUB")?HOSTS.keySet():BAIDU_KEYS;
        if(!keys.containsAll(links.keySet()))throw new ResponseStatusException(BAD_REQUEST,"链接字段与项目资源类型不匹配");
        links.forEach((key,value)->{
            if(value==null||value.isBlank())return;
            String text=value.trim();
            try {
                URI uri=URI.create(text);
                Set<String> hosts=mode.equals("GITHUB")?HOSTS.get(key):Set.of("pan.baidu.com","yun.baidu.com");
                if(text.length()>2048||!"https".equalsIgnoreCase(uri.getScheme())||uri.getHost()==null||!hosts.contains(uri.getHost().toLowerCase(java.util.Locale.ROOT))||uri.getRawUserInfo()!=null||(uri.getPort()!=-1&&uri.getPort()!=443))throw new IllegalArgumentException();
            } catch(IllegalArgumentException ex){throw new ResponseStatusException(BAD_REQUEST,"请填写对应平台的有效 HTTPS 链接");}
            result.put(key,text);
        });
        return result.toString();
    }
    static JsonNode read(String text){try{return JSON.readTree(text);}catch(Exception ex){throw new IllegalStateException("Stored project resources invalid",ex);}}
}
