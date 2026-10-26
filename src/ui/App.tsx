export function App() {
  return (
    <main className="title-screen">
      <img className="title-icon" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
      <h1>Fitness Quest</h1>
      <p>Your adventure starts soon. Food logging arrives in the next update.</p>
    </main>
  );
}
