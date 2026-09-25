/** Present a submitted form as compact facts inside its conversation turn. */
export default function BuyerMessage({ content }: { content: string }) {
  if (!content.startsWith("Buyer form\n")) return <p>{content}</p>;
  const [facts, ...message] = content.slice("Buyer form\n".length).split("\nAdditional needs: ");
  return <>
    <div className="message-conditions">{facts.split("\n").map((line, index) => {
      const separator = line.indexOf(": ");
      return <div key={index}><span>{line.slice(0, separator)}</span><strong>{line.slice(separator + 2)}</strong></div>;
    })}</div>
    {message.length > 0 && <p>{message.join("\nAdditional needs: ")}</p>}
  </>;
}
