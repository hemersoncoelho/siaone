-- Atualiza título e/ou valor de um deal, validando que pertence à empresa.
-- Parâmetros nulos preservam o valor existente (COALESCE).
create or replace function public.rpc_update_deal_details(
  p_company_id uuid,
  p_deal_id    uuid,
  p_name       text    default null,
  p_value      numeric default null
)
returns public.deals
language plpgsql
security invoker
as $$
declare
  v_deal public.deals;
begin
  update public.deals
     set title      = coalesce(p_name,  title),
         amount     = coalesce(p_value, amount),
         updated_at = now()
   where id         = p_deal_id
     and company_id = p_company_id
  returning * into v_deal;

  if v_deal.id is null then
    raise exception 'Deal não encontrado para a empresa informada';
  end if;

  return v_deal;
end;
$$;
