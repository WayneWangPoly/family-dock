# App UI Integration

## Principle

This step does not invent new features. It organizes existing backend capabilities into a real app UI.

## Source of truth

All panels read from `FamilyData`, which is loaded from Supabase.

## Covered modules

| Panel | Data |
|---|---|
| Today | calendar_events, route_stops, payments, homework_tasks |
| Payments | payments, editing_locks |
| Homework | homework_tasks, homework_items |
| Requests | requests |
| Notebook | learning_records, learning_summaries |
| Meals | meal_plans, shopping_items |
| People | family_members, places |

## Known limits

The route section uses external Google Maps links. It does not yet embed a map.
This avoids adding a Google Maps API key before the rest of the app shell is stable.

## Next package recommendation

Step 7.6:
- real month/week/day calendar views
- route map placeholder upgraded to embedded map
- create/edit forms for payment/homework/request
