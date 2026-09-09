/**
 * There is one learner and no sign-in.
 *
 * Authentication would add a login screen, a session store and a password reset
 * flow, and would demonstrate nothing about low-level design that the practice
 * loop does not already show. Every repository method is already keyed by
 * learner id, so adding real accounts later is a lookup here, not a rewrite.
 */
export const LEARNER_ID = "demo-learner";
export const LEARNER_NAME = "You";
