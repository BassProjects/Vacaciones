export function canAccessRequest(me, request) {
  return (
    me.role === "admin" ||
    me.id === request.user_id ||
    (me.role === "manager" && me.department === request.department)
  );
}
