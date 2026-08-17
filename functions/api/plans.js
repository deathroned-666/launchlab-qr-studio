import { json, PLAN_BY_ID } from '../_lib/shared.js';

export function onRequestGet() {
  const plans = Object.entries(PLAN_BY_ID).map(([planId, plan]) => ({
    planId,
    name: plan.name,
    dynamicQrLimit: plan.limit
  }));
  return json({ plans });
}
