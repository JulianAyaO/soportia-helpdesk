package com.soportia.ticket;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;

public final class TicketRules {
    private TicketRules(){}
    public enum Status { OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CLOSED, CANCELLED }
    public enum Priority { LOW, MEDIUM, HIGH, CRITICAL }
    private static final Map<Status, EnumSet<Status>> TRANSITIONS = new EnumMap<>(Status.class);
    static {
        TRANSITIONS.put(Status.OPEN, EnumSet.of(Status.IN_PROGRESS,Status.CANCELLED));
        TRANSITIONS.put(Status.IN_PROGRESS, EnumSet.of(Status.WAITING_FOR_REQUESTER,Status.RESOLVED,Status.CANCELLED));
        TRANSITIONS.put(Status.WAITING_FOR_REQUESTER, EnumSet.of(Status.IN_PROGRESS,Status.RESOLVED,Status.CANCELLED));
        TRANSITIONS.put(Status.RESOLVED, EnumSet.of(Status.IN_PROGRESS,Status.CLOSED));
        TRANSITIONS.put(Status.CLOSED, EnumSet.noneOf(Status.class));
        TRANSITIONS.put(Status.CANCELLED, EnumSet.noneOf(Status.class));
    }
    public static boolean canTransition(Status from,Status to){ return TRANSITIONS.get(from).contains(to); }
    public static Priority priority(int impact,int urgency){
        if(impact<1||impact>3||urgency<1||urgency>3) throw new IllegalArgumentException("Impact and urgency must be 1..3");
        int score=impact*urgency;
        if(score>=9)return Priority.CRITICAL;
        if(score>=6)return Priority.HIGH;
        if(score>=3)return Priority.MEDIUM;
        return Priority.LOW;
    }
}
