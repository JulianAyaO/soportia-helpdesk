package com.soportia.config;

import com.soportia.ticket.BusinessHours;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class DemoDataSeeder implements CommandLineRunner {
    public static final UUID EMPLOYEE=UUID.fromString("10000000-0000-0000-0000-000000000001");
    public static final UUID AGENT=UUID.fromString("10000000-0000-0000-0000-000000000002");
    public static final UUID ADMIN=UUID.fromString("10000000-0000-0000-0000-000000000003");
    public static final UUID IT_AGENT=UUID.fromString("10000000-0000-0000-0000-000000000004");
    public static final UUID AUTOMATION_BOT=UUID.fromString("10000000-0000-0000-0000-000000000005");
    public static final UUID DIEGO=UUID.fromString("10000000-0000-0000-0000-000000000011");
    public static final UUID LAURA=UUID.fromString("10000000-0000-0000-0000-000000000012");
    public static final UUID FELIPE=UUID.fromString("10000000-0000-0000-0000-000000000013");
    public static final UUID NATALIA=UUID.fromString("10000000-0000-0000-0000-000000000014");
    public static final UUID SUPPORT=UUID.fromString("20000000-0000-0000-0000-000000000001");
    public static final UUID IT=UUID.fromString("20000000-0000-0000-0000-000000000002");
    public static final UUID ACCESS=UUID.fromString("30000000-0000-0000-0000-000000000001");
    public static final UUID HARDWARE=UUID.fromString("30000000-0000-0000-0000-000000000002");
    public static final UUID AUTO_ROUTE=UUID.fromString("60000000-0000-0000-0000-000000000001");
    public static final UUID SLA_ALERT=UUID.fromString("60000000-0000-0000-0000-000000000002");
    public static final UUID WAITING_REMINDER=UUID.fromString("60000000-0000-0000-0000-000000000003");
    public static final UUID KEYWORD_REPLY=UUID.fromString("60000000-0000-0000-0000-000000000004");
    private static final UUID T_MFA=UUID.fromString("50000000-0000-0000-0000-000000000001");
    private static final UUID T_LOCK=UUID.fromString("50000000-0000-0000-0000-000000000002");
    private static final UUID T_VPN=UUID.fromString("50000000-0000-0000-0000-000000000003");
    private static final UUID T_OUTLOOK=UUID.fromString("50000000-0000-0000-0000-000000000004");
    private static final UUID T_FOLDER=UUID.fromString("50000000-0000-0000-0000-000000000005");
    private static final UUID T_LEAVE=UUID.fromString("50000000-0000-0000-0000-000000000006");
    private static final UUID T_LAPTOP=UUID.fromString("50000000-0000-0000-0000-000000000007");
    private static final UUID T_MONITOR=UUID.fromString("50000000-0000-0000-0000-000000000008");
    private static final UUID T_HEADSET=UUID.fromString("50000000-0000-0000-0000-000000000009");
    private static final UUID T_PRINTER=UUID.fromString("50000000-0000-0000-0000-000000000010");
    private static final UUID T_KEYBOARD=UUID.fromString("50000000-0000-0000-0000-000000000011");
    private static final UUID T_DOCK=UUID.fromString("50000000-0000-0000-0000-000000000012");
    private static final UUID T_CRM=UUID.fromString("50000000-0000-0000-0000-000000000013");
    private static final UUID T_SHARE=UUID.fromString("50000000-0000-0000-0000-000000000014");
    private static final UUID T_WIFI=UUID.fromString("50000000-0000-0000-0000-000000000015");
    private static final UUID T_BATTERY=UUID.fromString("50000000-0000-0000-0000-000000000016");
    private static final UUID T_MOUSE=UUID.fromString("50000000-0000-0000-0000-000000000017");
    private static final UUID T_SAP=UUID.fromString("50000000-0000-0000-0000-000000000018");
    private final JdbcClient db; private final PasswordEncoder encoder;
    public DemoDataSeeder(JdbcClient db,PasswordEncoder encoder){this.db=db;this.encoder=encoder;}

    @Override @Transactional
    public void run(String... args) {
        automation(AUTO_ROUTE,"Auto route ticket","ticket.created",
                "{\"source\":\"category.defaultTeam\"}","{\"type\":\"ROUTE_TEAM\"}");
        automation(SLA_ALERT,"SLA risk alert","ticket.sla.at_risk",
                "{\"slaStatus\":[\"AT_RISK\",\"BREACHED\"]}","{\"type\":\"ESCALATE_OPEN\"}");
        automation(WAITING_REMINDER,"Waiting requester reminder","ticket.waiting.reminder",
                "{\"status\":\"WAITING_FOR_REQUESTER\",\"hours\":2}","{\"type\":\"NOTIFY_REQUESTER\"}");
        automation(KEYWORD_REPLY,"Keyword guided reply","ticket.created",
                "{\"keywords\":[\"contraseña\",\"vpn\"]}","{\"type\":\"PUBLIC_COMMENT\"}");
        Integer count=db.sql("select count(*) from users").query(Integer.class).single();
        if(count==0){
            user(EMPLOYEE,"employee@soportia.local","Camila Restrepo","EMPLOYEE");
            user(AGENT,"agent@soportia.local","Andrés Molina","SUPPORT_AGENT");
            user(IT_AGENT,"it-agent@soportia.local","Juliana Pérez","SUPPORT_AGENT");
            user(ADMIN,"admin@soportia.local","Marta Suárez","ADMIN");
            db.sql("insert into teams(id,name,description) values(:id,'Mesa de servicio','Accesos, cuentas y solicitudes generales')")
                    .param("id",SUPPORT).update();
            db.sql("insert into teams(id,name,description) values(:id,'Operaciones de equipos','Equipos e infraestructura')")
                    .param("id",IT).update();
            db.sql("insert into team_members(team_id,user_id) values(:t,:u)").param("t",SUPPORT).param("u",AGENT).update();
            db.sql("insert into team_members(team_id,user_id) values(:t,:u)").param("t",IT).param("u",IT_AGENT).update();
            category(ACCESS,"Accesos y cuentas",SUPPORT); category(HARDWARE,"Equipos",IT);
            sla("40000000-0000-0000-0000-000000000001","Crítica","CRITICAL",15,240);
            sla("40000000-0000-0000-0000-000000000002","Alta","HIGH",60,480);
            sla("40000000-0000-0000-0000-000000000003","Media","MEDIUM",240,1440);
            sla("40000000-0000-0000-0000-000000000004","Baja","LOW",480,2880);
        }
        ensureDemoRoster();
    }
    private void ensureDemoRoster(){
        ensureUser(IT_AGENT,"it-agent@soportia.local","Juliana Pérez","SUPPORT_AGENT");
        ensureUser(AUTOMATION_BOT,"automation@soportia.local","Automatización","SUPPORT_AGENT");
        ensureUser(DIEGO,"diego.vargas@soportia.local","Diego Vargas","EMPLOYEE");
        ensureUser(LAURA,"laura.gomez@soportia.local","Laura Gómez","EMPLOYEE");
        ensureUser(FELIPE,"felipe.ortiz@soportia.local","Felipe Ortiz","EMPLOYEE");
        ensureUser(NATALIA,"natalia.ruiz@soportia.local","Natalia Ruiz","EMPLOYEE");
        demoIdentity(EMPLOYEE,"employee@soportia.local","Camila Restrepo",true);
        demoIdentity(AGENT,"agent@soportia.local","Andrés Molina",true);
        demoIdentity(IT_AGENT,"it-agent@soportia.local","Juliana Pérez",true);
        demoIdentity(ADMIN,"admin@soportia.local","Marta Suárez",true);
        demoIdentity(AUTOMATION_BOT,"automation@soportia.local","Automatización",false);
        demoIdentity(DIEGO,"diego.vargas@soportia.local","Diego Vargas",true);
        demoIdentity(LAURA,"laura.gomez@soportia.local","Laura Gómez",true);
        demoIdentity(FELIPE,"felipe.ortiz@soportia.local","Felipe Ortiz",true);
        demoIdentity(NATALIA,"natalia.ruiz@soportia.local","Natalia Ruiz",true);
        db.sql("update users set email=replace(email,'@supportflow.local','@soportia.local') where email like '%@supportflow.local'").update();
        ensureMember(IT,IT_AGENT);
        db.sql("delete from team_members where user_id in (select id from users where role='ADMIN')").update();
        db.sql("update teams set name='Mesa de servicio',description='Accesos, cuentas y solicitudes generales' where id=:id").param("id",SUPPORT).update();
        db.sql("update teams set name='Operaciones de equipos',description='Equipos e infraestructura' where id=:id").param("id",IT).update();
        db.sql("update categories set name='Accesos y cuentas' where id=:id or name='Access & accounts'").param("id",ACCESS).update();
        db.sql("update categories set name='Equipos' where id=:id or name='Hardware'").param("id",HARDWARE).update();
        db.sql("update sla_policies set name='Crítica' where priority='CRITICAL'").update();
        db.sql("update sla_policies set name='Alta' where priority='HIGH'").update();
        db.sql("update sla_policies set name='Media' where priority='MEDIUM'").update();
        db.sql("update sla_policies set name='Baja' where priority='LOW'").update();
        resetDemoTickets();
    }
    private void resetDemoTickets(){
        db.sql("delete from automation_executions").update();
        db.sql("delete from outbox_events").update();
        db.sql("delete from tickets").update();
        db.sql("delete from notifications").update();
        for(DemoTicket demo:demoTickets()) insertTicket(demo);
        db.sql("update app_sequences set seq_value=1860 where name='ticket'").update();
        refreshOpenSlaDueDates();
        OffsetDateTime waitingSince=OffsetDateTime.now(ZoneOffset.UTC).minusHours(3);
        db.sql("update tickets set updated_at=:ago where id=:id").param("ago",waitingSince).param("id",T_VPN).update();
        db.sql("update tickets set updated_at=:ago where id=:id").param("ago",waitingSince).param("id",T_HEADSET).update();
        seedComments();
        seedQueueNotifications();
        seedReplyNotifications();
    }
    private void demoIdentity(UUID id,String email,String name,boolean active){
        db.sql("update users set email=:e,display_name=:n,active=:a where id=:id")
                .param("e",email).param("n",name).param("a",active).param("id",id).update();
    }
    private void ensureUser(UUID id,String email,String name,String role){
        db.sql("""
                insert into users(id,email,password_hash,display_name,role)
                select :id,:e,:p,:n,:r
                where not exists (select 1 from users where id=:id or lower(email)=lower(:e))
                """).param("id",id).param("e",email).param("p",encoder.encode("Demo123!")).param("n",name).param("r",role).update();
    }
    private void ensureMember(UUID team,UUID user){
        db.sql("""
                insert into team_members(team_id,user_id) select :t,:u
                where not exists (select 1 from team_members where team_id=:t and user_id=:u)
                """).param("t",team).param("u",user).update();
    }
    private void user(UUID id,String email,String name,String role){
        db.sql("insert into users(id,email,password_hash,display_name,role) values(:id,:e,:p,:n,:r)")
                .param("id",id).param("e",email).param("p",encoder.encode("Demo123!")).param("n",name).param("r",role).update();
    }
    private void category(UUID id,String name,UUID team){
        db.sql("insert into categories(id,name,default_team_id) values(:id,:n,:t)")
                .param("id",id).param("n",name).param("t",team).update();
    }
    private void sla(String id,String name,String priority,int response,int resolution){
        db.sql("insert into sla_policies(id,name,priority,response_minutes,resolution_minutes) values(:id,:n,:p,:r,:x)")
                .param("id",UUID.fromString(id)).param("n",name).param("p",priority).param("r",response).param("x",resolution).update();
    }
    private void automation(UUID id,String name,String eventType,String conditions,String actions){
        db.sql("""
                insert into automations(id,name,event_type,enabled,conditions_json,actions_json)
                select :id,:name,:event,true,:conditions,:actions
                where not exists (select 1 from automations where id=:id)
                """).param("id",id).param("name",name).param("event",eventType)
                .param("conditions",conditions).param("actions",actions).update();
    }
    private List<DemoTicket> demoTickets(){
        return List.of(
                t(T_MFA,"SUP-1843",
                        "No me llega el código de doble factor",
                        "Al entrar al portal de nómina no recibo el SMS ni la notificación de la app. El periodo de pago cierra hoy a las 18:00 y no puedo validar mis datos ni descargar el desprendible.",
                        "OPEN",3,3,"CRITICAL",EMPLOYEE,null,ACCESS,SUPPORT,0,16,50,null),
                t(T_LOCK,"SUP-1844",
                        "Cuenta bloqueada por intentos fallidos",
                        "Alguien intentó entrar a mi usuario esta mañana y Active Directory me bloqueó. No abro el VPN ni el directorio. Tengo visitas a clientes a las 11:00 y necesito las cotizaciones del CRM.",
                        "IN_PROGRESS",3,2,"HIGH",DIEGO,AGENT,ACCESS,SUPPORT,0,9,20,null),
                t(T_VPN,"SUP-1845",
                        "Restablecer la contraseña de la VPN",
                        "Olvidé la contraseña del cliente VPN y el restablecimiento automático no envía el correo. Estoy en casa y no llego a tesorería ni a las conciliaciones del día.",
                        "WAITING_FOR_REQUESTER",2,2,"MEDIUM",EMPLOYEE,AGENT,ACCESS,SUPPORT,1,10,15,null),
                t(T_OUTLOOK,"SUP-1846",
                        "Outlook pide credenciales en bucle",
                        "Después del cambio de contraseña de ayer, Outlook pide usuario una y otra vez y no abre la bandeja. Tengo facturas de proveedores pendientes de respuesta.",
                        "OPEN",2,3,"HIGH",NATALIA,null,ACCESS,SUPPORT,1,11,5,null),
                t(T_FOLDER,"SUP-1847",
                        "Acceso a la carpeta compartida de Finanzas",
                        "Me cambiaron al equipo de tesorería y no veo \\\\files\\finanzas. Sin esa carpeta no puedo cargar las conciliaciones ni los extractos del banco.",
                        "IN_PROGRESS",2,2,"MEDIUM",EMPLOYEE,AGENT,ACCESS,SUPPORT,2,9,40,null),
                t(T_LEAVE,"SUP-1848",
                        "Alta en el portal de vacaciones",
                        "Llevo dos semanas en RR.HH. y el portal de ausencias dice que no tengo cuenta. Necesito cargar un día para un trámite médico la semana próxima.",
                        "RESOLVED",1,2,"LOW",LAURA,AGENT,ACCESS,SUPPORT,9,10,10,7),
                t(T_LAPTOP,"SUP-1849",
                        "El portátil no enciende después del corte de luz",
                        "Se fue la luz en planta 3. Al volver, el portátil no da imagen ni ventilador. Tengo una visita de un cliente corporativo mañana a primera hora y no tengo equipo de respaldo.",
                        "OPEN",3,3,"CRITICAL",FELIPE,null,HARDWARE,IT,0,17,5,null),
                t(T_MONITOR,"SUP-1850",
                        "El monitor externo no da señal",
                        "Conecté el monitor Dell por HDMI y por USB-C y ambos quedan en negro. El portátil sí funciona. Necesito la doble pantalla para revisar las cotizaciones del trimestre.",
                        "IN_PROGRESS",2,2,"MEDIUM",DIEGO,IT_AGENT,HARDWARE,IT,3,10,30,null),
                t(T_HEADSET,"SUP-1851",
                        "Los auriculares de la sala de juntas no tienen audio",
                        "En la sala B los Jabra se conectan al portátil pero no se oye a los participantes remotos. Tenemos entrevistas de selección mañana y el recambio de sala ya está ocupado.",
                        "WAITING_FOR_REQUESTER",2,2,"MEDIUM",LAURA,IT_AGENT,HARDWARE,IT,6,14,20,null),
                t(T_PRINTER,"SUP-1852",
                        "La impresora de planta no imprime",
                        "La HP de recepción muestra atasco, pero no hay papel dentro. Nadie puede imprimir gafetes ni pases de visitante para las reuniones de la tarde.",
                        "RESOLVED",2,3,"HIGH",NATALIA,IT_AGENT,HARDWARE,IT,11,8,50,8),
                t(T_KEYBOARD,"SUP-1853",
                        "El teclado deja de responder a ratos",
                        "El teclado de la estación fija se congela unos segundos y luego escribe varias letras juntas. Empezó la semana pasada y ya está afectando las actas de operación.",
                        "CLOSED",1,1,"LOW",FELIPE,IT_AGENT,HARDWARE,IT,13,9,15,10),
                t(T_DOCK,"SUP-1854",
                        "Necesito una estación de acoplamiento",
                        "Me entregaron un portátil nuevo sin dock. Solo tengo un USB-C y no puedo usar el monitor, el cable de red ni el teclado de tesorería al mismo tiempo.",
                        "RESOLVED",2,2,"MEDIUM",EMPLOYEE,IT_AGENT,HARDWARE,IT,6,11,0,1),
                t(T_CRM,"SUP-1855",
                        "Acceso al CRM para el equipo comercial",
                        "Entraron dos vendedores nuevos y no ven las oportunidades de la regional. Sin ese permiso no pueden cargar las visitas de esta semana.",
                        "RESOLVED",3,2,"HIGH",DIEGO,AGENT,ACCESS,SUPPORT,8,9,25,5),
                t(T_SHARE,"SUP-1856",
                        "Permiso al sitio de onboarding en SharePoint",
                        "El sitio de inducción me pide acceso. RR.HH. necesita que los nuevos lo vean antes de la capacitación del viernes.",
                        "CLOSED",2,1,"MEDIUM",LAURA,AGENT,ACCESS,SUPPORT,12,10,45,10),
                t(T_WIFI,"SUP-1857",
                        "El WiFi de planta 2 se cae cada hora",
                        "En operaciones el WiFi se corta unos tres minutos y vuelven a pedir clave. Las pistolas de inventario y las tablets de despacho quedan fuera de línea.",
                        "IN_PROGRESS",3,2,"HIGH",FELIPE,IT_AGENT,HARDWARE,IT,3,8,10,null),
                t(T_BATTERY,"SUP-1858",
                        "Batería del portátil hinchada",
                        "La batería del Latitude se abultó y el equipo no cierra bien la tapa. Lo estoy usando solo con el cargador. Pido revisión y un equipo de préstamo.",
                        "OPEN",2,2,"MEDIUM",NATALIA,null,HARDWARE,IT,2,15,40,null),
                t(T_MOUSE,"SUP-1859",
                        "Reemplazo del mouse de la estación",
                        "El mouse de la estación 14 hace doble clic solo. Pedí recambio en el inventario de planta.",
                        "RESOLVED",1,1,"LOW",LAURA,IT_AGENT,HARDWARE,IT,10,13,20,9),
                t(T_SAP,"SUP-1860",
                        "Error al contabilizar en SAP",
                        "Al guardar un documento FI aparece 'no authorization for company code 1000'. Contabilidad no puede cerrar el lote de hoy.",
                        "RESOLVED",2,2,"MEDIUM",NATALIA,AGENT,ACCESS,SUPPORT,7,9,55,4)
        );
    }
    private DemoTicket t(UUID id,String number,String title,String description,String status,int impact,int urgency,
                         String priority,UUID requester,UUID assignee,UUID category,UUID team,int createdDaysAgo,
                         int hour,int minute,Integer resolvedDaysAgo){
        return new DemoTicket(id,number,title,description,status,impact,urgency,priority,requester,assignee,category,team,
                createdDaysAgo,hour,minute,resolvedDaysAgo);
    }
    private void insertTicket(DemoTicket demo){
        Timeline times=timeline(demo);
        UUID sla=slaId(demo.priority);
        db.sql("""
                insert into tickets(id,number,title,description,status,impact,urgency,priority,requester_id,
                assignee_id,team_id,category_id,sla_policy_id,response_due_at,resolution_due_at,first_response_at,
                resolved_at,closed_at,created_at,updated_at)
                values(:id,:num,:title,:d,:s,:i,:u,:p,:r,:a,:t,:c,:sla,:rd,:xd,:fr,:res,:cl,:created,:updated)
                """)
                .param("id",demo.id).param("num",demo.number).param("title",demo.title).param("d",demo.description)
                .param("s",demo.status).param("i",demo.impact).param("u",demo.urgency).param("p",demo.priority).param("r",demo.requester)
                .param("a",demo.assignee).param("t",demo.team).param("c",demo.category).param("sla",sla)
                .param("rd",times.responseDue).param("xd",times.resolutionDue).param("fr",times.firstResponse)
                .param("res",times.resolvedAt).param("cl",times.closedAt).param("created",times.created).param("updated",times.updated)
                .update();
        history(demo.id,demo.requester,"CREATED",null,"OPEN",times.created);
        if(demo.assignee!=null){
            history(demo.id,demo.assignee,"ASSIGNED",null,demo.assignee.toString(),times.created.plusMinutes(25));
        }
        if("IN_PROGRESS".equals(demo.status)){
            history(demo.id,demo.assignee,"STATUS_CHANGED","OPEN","IN_PROGRESS",times.created.plusMinutes(50));
        } else if("WAITING_FOR_REQUESTER".equals(demo.status)){
            history(demo.id,demo.assignee,"STATUS_CHANGED","OPEN","IN_PROGRESS",times.created.plusMinutes(40));
            history(demo.id,demo.assignee,"STATUS_CHANGED","IN_PROGRESS","WAITING_FOR_REQUESTER",times.firstResponse!=null?times.firstResponse.plusHours(2):times.created.plusHours(3));
        } else if("RESOLVED".equals(demo.status)){
            history(demo.id,demo.assignee,"STATUS_CHANGED","OPEN","IN_PROGRESS",times.created.plusHours(1));
            history(demo.id,demo.assignee,"STATUS_CHANGED","IN_PROGRESS","RESOLVED",times.resolvedAt);
        } else if("CLOSED".equals(demo.status)){
            history(demo.id,demo.assignee,"STATUS_CHANGED","OPEN","IN_PROGRESS",times.created.plusHours(1));
            OffsetDateTime resolved=times.resolvedAt!=null?times.resolvedAt:times.created.plusDays(2);
            history(demo.id,demo.assignee,"STATUS_CHANGED","IN_PROGRESS","RESOLVED",resolved.minusHours(5));
            history(demo.id,demo.requester,"STATUS_CHANGED","RESOLVED","CLOSED",resolved);
        }
    }
    private Timeline timeline(DemoTicket demo){
        OffsetDateTime now=OffsetDateTime.now(BusinessHours.ZONE);
        OffsetDateTime created=now.minusDays(demo.createdDaysAgo)
                .withHour(demo.hour).withMinute(demo.minute).withSecond(0).withNano(0);
        if(created.isAfter(now)) created=now.minusMinutes(25);
        OffsetDateTime first="OPEN".equals(demo.status)?null:created.plusMinutes(40);
        if(first!=null&&first.isAfter(now)) first=now.minusMinutes(12);
        OffsetDateTime resolved=demo.resolvedDaysAgo==null?null
                :now.minusDays(demo.resolvedDaysAgo).withHour(16).withMinute(40).withSecond(0).withNano(0);
        if(resolved!=null&&resolved.isAfter(now)) resolved=now.minusMinutes(8);
        if(resolved!=null&&!resolved.isAfter(created)) resolved=created.plusHours(2);
        OffsetDateTime closed="CLOSED".equals(demo.status)?resolved:null;
        OffsetDateTime updated=resolved!=null?resolved:first!=null?first:created;
        int response=switch(demo.priority){case "CRITICAL"->15;case "HIGH"->60;case "LOW"->480;default->240;};
        int resolution=switch(demo.priority){case "CRITICAL"->240;case "HIGH"->480;case "LOW"->2880;default->1440;};
        return new Timeline(created,updated,first,resolved,closed,
                BusinessHours.addMinutes(created,response),BusinessHours.addMinutes(created,resolution));
    }
    private UUID slaId(String priority){
        return UUID.fromString(switch(priority){
            case "CRITICAL" -> "40000000-0000-0000-0000-000000000001";
            case "HIGH" -> "40000000-0000-0000-0000-000000000002";
            case "LOW" -> "40000000-0000-0000-0000-000000000004";
            default -> "40000000-0000-0000-0000-000000000003";
        });
    }
    private void refreshOpenSlaDueDates(){
        for(Map<String,Object> row:db.sql("""
                select t.id,t.created_at,p.response_minutes,p.resolution_minutes
                from tickets t join sla_policies p on p.id=t.sla_policy_id
                where t.status not in ('RESOLVED','CLOSED','CANCELLED')
                """).query().listOfRows()){
            var created=BusinessHours.toOffset(row.get("created_at"));
            db.sql("update tickets set response_due_at=:r,resolution_due_at=:x where id=:id")
                    .param("r",BusinessHours.addMinutes(created,((Number)row.get("response_minutes")).longValue()))
                    .param("x",BusinessHours.addMinutes(created,((Number)row.get("resolution_minutes")).longValue()))
                    .param("id",row.get("id")).update();
        }
    }
    private void seedComments(){
        comment("70000000-0000-0000-0000-000000000001",T_VPN,AUTOMATION_BOT,
                "Hola, vi que mencionas la VPN o la contraseña. Prueba el restablecimiento corporativo desde el portal de cuentas y, si el correo no llega, responde aquí con el horario en el que lo intentaste.",
                "PUBLIC","AUTOMATION_COMMENTED",28);
        comment("70000000-0000-0000-0000-000000000002",T_VPN,AGENT,
                "Camila, el restablecimiento automático falló porque el correo personal de ficha está desactualizado. ¿Puedes confirmar el correo al que debemos enviar el enlace?",
                "PUBLIC","COMMENTED",5);
        comment("70000000-0000-0000-0000-000000000003",T_LOCK,AGENT,
                "Diego, ya desbloqueé la cuenta en Active Directory. Entra de nuevo al VPN y avísame si el CRM abre las oportunidades de la regional.",
                "PUBLIC","COMMENTED",2);
        comment("70000000-0000-0000-0000-000000000004",T_LOCK,AGENT,
                "Bloqueo por 12 intentos desde la red de la cafetería. No parece un ataque; lo dejé registrado por si se repite.",
                "INTERNAL","COMMENTED",2);
        comment("70000000-0000-0000-0000-000000000005",T_FOLDER,AGENT,
                "Para darte \\files\\finanzas necesito el visto bueno de tu jefa de tesorería. ¿Me confirmas el nombre para pedir el alta en el grupo AD?",
                "PUBLIC","COMMENTED",20);
        comment("70000000-0000-0000-0000-000000000006",T_FOLDER,EMPLOYEE,
                "La jefa es Patricia Mejía. Ya le escribí; está de acuerdo con el acceso de lectura y carga.",
                "PUBLIC","COMMENTED",8);
        comment("70000000-0000-0000-0000-000000000007",T_FOLDER,AGENT,
                "Estoy agregando a Camila al grupo Finanzas-Tesoreria. En cuanto replique, debería ver la carpeta. Si no aparece, cierra sesión en Windows y vuelve a entrar.",
                "PUBLIC","COMMENTED",3);
        comment("70000000-0000-0000-0000-000000000008",T_MONITOR,IT_AGENT,
                "Diego, revisé el puerto HDMI de esa estación. Hay un adaptador USB-C en recepción; conéctalo y dime si el Dell enciende. Si sigue negro, paso a cambiar el cable.",
                "PUBLIC","COMMENTED",6);
        comment("70000000-0000-0000-0000-000000000009",T_HEADSET,IT_AGENT,
                "Laura, en la sala B el dongle de los Jabra a veces queda en el otro puerto. ¿Puedes confirmar si ves el dispositivo 'Jabra Link' en el administrador de sonido?",
                "PUBLIC","COMMENTED",4);
        comment("70000000-0000-0000-0000-000000000010",T_WIFI,IT_AGENT,
                "Felipe, el AP-23 de planta 2 está al 94% de CPU. Voy a reiniciarlo en la ventana de las 18:00 para no cortar el despacho. Te aviso cuando quede estable.",
                "PUBLIC","COMMENTED",7);
        comment("70000000-0000-0000-0000-000000000011",T_WIFI,IT_AGENT,
                "Programé el reinicio del AP-23 a las 18:00. Si el corte sigue después, subo a reemplazo de access point.",
                "INTERNAL","COMMENTED",6);
        comment("70000000-0000-0000-0000-000000000012",T_PRINTER,IT_AGENT,
                "Había un resto de etiqueta térmica en el rodillo, no un atasco de hoja. Limpié el paso y dejé resma nueva. Prueben un gafete de visitante y confirmen.",
                "PUBLIC","COMMENTED",200);
        comment("70000000-0000-0000-0000-000000000013",T_PRINTER,NATALIA,
                "Ya imprimimos los pases. Quedó bien, gracias.",
                "PUBLIC","COMMENTED",190);
        comment("70000000-0000-0000-0000-000000000014",T_DOCK,IT_AGENT,
                "Camila, dejé una estación USB-C en tesorería, escritorio 4. Conecta corriente, red y el monitor por la dock; el portátil solo va al conector central.",
                "PUBLIC","COMMENTED",30);
        comment("70000000-0000-0000-0000-000000000015",T_DOCK,EMPLOYEE,
                "Ya la conecté y veo monitor, red y teclado. Pueden cerrar cuando quieran.",
                "PUBLIC","COMMENTED",26);
        comment("70000000-0000-0000-0000-000000000016",T_CRM,AGENT,
                "Diego, di de alta a los dos vendedores en el rol Comercial-Regional. Pídeles que cierren el CRM y vuelvan a entrar. Si alguna oportunidad sigue oculta, mándame el código.",
                "PUBLIC","COMMENTED",120);
        comment("70000000-0000-0000-0000-000000000017",T_SAP,AGENT,
                "Natalia, el perfil FI no tenía la sociedad 1000. Ya se la asigné. Prueba a contabilizar de nuevo el lote.",
                "PUBLIC","COMMENTED",96);
        comment("70000000-0000-0000-0000-000000000018",T_LEAVE,AGENT,
                "Laura, ya creé tu usuario en el portal de ausencias. Entra con el correo corporativo; la primera clave llega al correo y caduca en 24 horas.",
                "PUBLIC","COMMENTED",170);
    }
    private void comment(String id,UUID ticketId,UUID author,String body,String visibility,String historyType,int hoursAgo){
        OffsetDateTime at=OffsetDateTime.now(ZoneOffset.UTC).minusHours(hoursAgo);
        db.sql("""
                insert into comments(id,ticket_id,author_id,body,visibility,created_at)
                values(:id,:t,:a,:b,:v,:c)
                """).param("id",UUID.fromString(id)).param("t",ticketId).param("a",author)
                .param("b",body).param("v",visibility).param("c",at).update();
        history(ticketId,author,historyType,null,visibility,at);
    }
    private void history(UUID ticketId,UUID actor,String type,String oldValue,String newValue,OffsetDateTime at){
        db.sql("insert into ticket_history(id,ticket_id,actor_id,event_type,old_value,new_value,created_at) values(:id,:t,:a,:e,:o,:n,:c)")
                .param("id",UUID.randomUUID()).param("t",ticketId).param("a",actor)
                .param("e",type).param("o",oldValue).param("n",newValue).param("c",at).update();
    }
    private void seedQueueNotifications(){
        notify(AGENT,T_MFA,"TICKET_CREATED","Nuevo ticket en tu cola: SUP-1843",
                "No me llega el código de doble factor",1);
        notify(AGENT,T_OUTLOOK,"TICKET_CREATED","Nuevo ticket en tu cola: SUP-1846",
                "Outlook pide credenciales en bucle",20);
        notify(IT_AGENT,T_LAPTOP,"TICKET_CREATED","Nuevo ticket en tu cola: SUP-1849",
                "El portátil no enciende después del corte de luz",1);
        notify(IT_AGENT,T_BATTERY,"TICKET_CREATED","Nuevo ticket en tu cola: SUP-1858",
                "Batería del portátil hinchada",28);
        notify(DIEGO,T_LOCK,"TICKET_ASSIGNED","Andrés Molina tomó SUP-1844",
                "La mesa ya está trabajando en el desbloqueo de tu cuenta.",3);
        notify(EMPLOYEE,T_FOLDER,"TICKET_ASSIGNED","Andrés Molina tomó SUP-1847",
                "La mesa está gestionando el acceso a la carpeta de Finanzas.",22);
    }
    private void seedReplyNotifications(){
        for(Map<String,Object> row:db.sql("""
                select t.requester_id as uid,t.id as tid,t.number as num,c.body as body,c.created_at as created
                from comments c join tickets t on t.id=c.ticket_id
                where c.visibility='PUBLIC' and c.author_id<>t.requester_id
                """).query().listOfRows()){
            String body=String.valueOf(row.get("body"));
            if(body.length()>160) body=body.substring(0,157)+"...";
            notify(asUuid(row.get("uid")),asUuid(row.get("tid")),"TICKET_REPLY",
                    "Nueva respuesta en "+row.get("num"),body,row.get("created"));
        }
    }
    private void notify(UUID userId,UUID ticketId,String type,String title,String body,int hoursAgo){
        notify(userId,ticketId,type,title,body,OffsetDateTime.now(ZoneOffset.UTC).minusHours(hoursAgo));
    }
    private void notify(UUID userId,UUID ticketId,String type,String title,String body,Object created){
        db.sql("""
                insert into notifications(id,user_id,ticket_id,type,title,body,created_at)
                values(:id,:uid,:tid,:type,:title,:body,:c)
                """).param("id",UUID.randomUUID()).param("uid",userId).param("tid",ticketId)
                .param("type",type).param("title",title).param("body",body).param("c",created).update();
    }
    private static UUID asUuid(Object value){
        if(value instanceof UUID uuid) return uuid;
        return UUID.fromString(String.valueOf(value));
    }
    private record DemoTicket(UUID id,String number,String title,String description,String status,int impact,int urgency,
                              String priority,UUID requester,UUID assignee,UUID category,UUID team,int createdDaysAgo,
                              int hour,int minute,Integer resolvedDaysAgo){}
    private record Timeline(OffsetDateTime created,OffsetDateTime updated,OffsetDateTime firstResponse,OffsetDateTime resolvedAt,
                            OffsetDateTime closedAt,OffsetDateTime responseDue,OffsetDateTime resolutionDue){}
}
