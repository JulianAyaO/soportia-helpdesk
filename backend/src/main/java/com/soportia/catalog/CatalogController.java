package com.soportia.catalog;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/catalog")
public class CatalogController {
    private final JdbcClient db;
    public CatalogController(JdbcClient db){this.db=db;}
    @GetMapping("/categories")
    public List<Map<String,Object>> categories(){
        return db.sql("select id,name,description,default_team_id as \"defaultTeamId\" from categories where active=true order by name").query().listOfRows();
    }
    @GetMapping("/teams")
    public List<Map<String,Object>> teams(){
        return db.sql("select id,name,description from teams order by name").query().listOfRows();
    }
    @GetMapping("/agents")
    public List<Map<String,Object>> agents(){
        return db.sql("""
                select u.id,u.email,u.display_name as "displayName",u.role,
                (select c.name from categories c join team_members m on m.team_id=c.default_team_id
                 where m.user_id=u.id and c.active=true order by c.name limit 1) as "categoryName"
                from users u where u.active=true and u.role='SUPPORT_AGENT' order by u.display_name
                """).query().listOfRows();
    }
}
