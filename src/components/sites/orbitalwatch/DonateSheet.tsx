"use client";

import React, { useEffect, useState } from "react";

interface DonateSheetProps {
  isOpen: boolean;
  onClose: () => void;
  stripePaymentLink?: string;
}

const AMOUNTS = [5, 10, 25, 50, 100] as const;
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 5000;

let warnedMissingLink = false;

export function DonateSheet({
  isOpen,
  onClose,
  stripePaymentLink = "",
}: DonateSheetProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(10);
  const [customAmount, setCustomAmount] = useState<string>("10");
  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const isConfigured = stripePaymentLink.startsWith("http");

  useEffect(() => {
    if (isConfigured || warnedMissingLink) return;
    warnedMissingLink = true;
    if (process.env.NODE_ENV !== "production") {
      console.warn("[OrbitalWatch] NEXT_PUBLIC_STRIPE_PAYMENT_LINK is not set");
    }
  }, [isConfigured]);

  if (!isOpen) return null;

  const handleChipClick = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount(String(amount));
    setStatus(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomAmount(val);
    const num = Number(val);
    setSelectedAmount(num);
    setStatus(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(customAmount);
    if (!Number.isFinite(val) || val < MIN_AMOUNT || val > MAX_AMOUNT) {
      setStatus({
        message: `Por favor ingresa un monto entre €${MIN_AMOUNT} y €${MAX_AMOUNT.toLocaleString("es-ES")}.`,
        isError: true,
      });
      return;
    }

    setIsLoading(true);
    setStatus(null);

    try {
      // Si el link de Stripe es directo (Stripe Payment Link), redirigir pasando el importe si aplica
      if (stripePaymentLink.startsWith("http")) {
        window.open(stripePaymentLink, "_blank", "noopener,noreferrer");
        setIsSuccess(true);
      } else {
        throw new Error("Stripe Payment Link no configurado aún.");
      }
    } catch (err: unknown) {
      setStatus({
        message: err instanceof Error ? err.message : "Error al procesar el pago.",
        isError: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="donate-layer" role="dialog" aria-modal="true" aria-labelledby="donate-title">
      <div className="donate-veil" onClick={onClose} aria-hidden="true" />
      <div className="donate-sheet panel">
        <button
          type="button"
          onClick={onClose}
          className="panel__close"
          aria-label="Cerrar ventana de donación"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>

        {!isSuccess ? (
          <form onSubmit={handleSubmit}>
            <p className="panel__kind">Contribución</p>
            <h2 id="donate-title" className="panel__name">
              Mantén OrbitalWatch en órbita
            </h2>
            <p className="donate-lead">
              Aporta lo que consideres. Tu soporte mantiene los datos de telemetría de la Tierra, basura espacial y el sistema solar libres y actualizados en tiempo real.
            </p>

            <div className="donate-chips" role="group" aria-label="Montos sugeridos">
              {AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  data-donate-chip={amt}
                  aria-pressed={selectedAmount === amt}
                  onClick={() => handleChipClick(amt)}
                >
                  €{amt}
                </button>
              ))}
            </div>

            <label className="donate-amount" htmlFor="donate-amount-input">
              <span>EUR</span>
              <input
                id="donate-amount-input"
                className="num"
                name="amount"
                type="number"
                inputMode="decimal"
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                step="0.01"
                value={customAmount}
                onChange={handleInputChange}
                required
              />
            </label>

            <button
              type="submit"
              className="donate-pay"
              disabled={isLoading || !isConfigured}
              aria-disabled={isLoading || !isConfigured}
              title={isConfigured ? undefined : "Payment link not configured"}
            >
              {isLoading ? "Abriendo Stripe…" : "Pagar con Stripe"}
            </button>
            <p className="donate-note">€1–€5.000. Procesado de forma 100% segura por Stripe.</p>

            {status && (
              <p
                className={`donate-status ${status.isError ? "is-error" : ""}`}
                role="status"
              >
                {status.message}
              </p>
            )}
          </form>
        ) : (
          <div>
            <p className="panel__kind">Confirmación</p>
            <h2 className="panel__name">¡Muchas gracias!</h2>
            <p className="donate-lead">
              Tu colaboración permite continuar con el desarrollo aeroespacial e integrar próximas capas científicas de ozono y atmósfera.
            </p>
            <button
              type="button"
              className="donate-pay"
              onClick={() => {
                setIsSuccess(false);
                onClose();
              }}
            >
              Volver al cielo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
