import { GlobalAIAssistant } from "../components/GlobalAIAssistant";
import { signOut } from "../lib/familyDataApi";
import { useFamilyData } from "../hooks/useFamilyData";

export function FamilyDataDebugPage() {
  const { data, loading, errorMessage, refresh } = useFamilyData();

  if (loading) {
    return <main style={pageStyle}>Loading family data...</main>;
  }

  if (errorMessage) {
    return (
      <main style={pageStyle}>
        <h1>Family Dock Data Check</h1>
        <div style={{ color: "crimson", fontWeight: 700 }}>{errorMessage}</div>
        <button onClick={() => refresh()} style={buttonStyle}>Retry</button>
      </main>
    );
  }

  if (!data) {
    return <main style={pageStyle}>No data loaded.</main>;
  }

  return (
    <main style={pageStyle}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1>{data.family.name}</h1>
          <p>
            {data.family.state_region} · {data.family.school_level} · {data.family.timezone}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "start" }}>
          <button onClick={() => refresh()} style={buttonStyle}>Refresh</button>
          <button
            onClick={async () => {
              await signOut();
              location.reload();
            }}
            style={buttonStyle}
          >
            Sign out
          </button>
        </div>
      </header>

      <section style={gridStyle}>
        <CountCard title="Members" count={data.members.length} />
        <CountCard title="Places" count={data.places.length} />
        <CountCard title="Events" count={data.calendarEvents.length} />
        <CountCard title="Route Stops" count={data.routeStops.length} />
        <CountCard title="Homework" count={data.homeworkTasks.length} />
        <CountCard title="Requests" count={data.requests.length} />
        <CountCard title="Payments" count={data.payments.length} />
        <CountCard title="Learning Records" count={data.learningRecords.length} />
        <CountCard title="Meal Plans" count={data.mealPlans.length} />
        <CountCard title="Shopping Items" count={data.shoppingItems.length} />
      </section>

      <DataSection title="Members">
        {data.members.map((member) => (
          <li key={member.id}>
            {member.display_name} — {member.role} — login: {String(member.can_login)}
          </li>
        ))}
      </DataSection>

      <DataSection title="Calendar Events">
        {data.calendarEvents.map((event) => (
          <li key={event.id}>
            {event.title} — {event.event_type} — {event.start_at}
          </li>
        ))}
      </DataSection>

      <DataSection title="Homework">
        {data.homeworkTasks.map((task) => (
          <li key={task.id}>
            {task.title} — {task.status} — items: {task.homework_items?.length ?? 0}
          </li>
        ))}
      </DataSection>

      <DataSection title="Payments">
        {data.payments.map((payment) => (
          <li key={payment.id}>
            {payment.title} — ${payment.amount} {payment.currency} — {payment.status}
          </li>
        ))}
      </DataSection>

      <DataSection title="Learning Records">
        {data.learningRecords.map((record) => (
          <li key={record.id}>
            {record.course_name} — {record.lesson_title} — {record.lesson_date}
          </li>
        ))}
      </DataSection>
      <GlobalAIAssistant
           familyData={data}
  	   activePage="debug"
           onRefresh={refresh}
       />
    </main>
  );
}

function CountCard({ title, count }: { title: string; count: number }) {
  return (
    <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 16 }}>
      <div style={{ color: "#666", fontSize: 13, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 900 }}>{count}</div>
    </div>
  );
}

function DataSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2>{title}</h2>
      <ul style={{ lineHeight: 1.8 }}>{children}</ul>
    </section>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 1080,
  margin: "32px auto",
  padding: 16,
  fontFamily: "system-ui, sans-serif",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginTop: 24,
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #ccc",
  background: "white",
  cursor: "pointer",
};
