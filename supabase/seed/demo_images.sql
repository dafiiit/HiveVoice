-- Photos for the demo content. The files sit in supabase/seed/images and are uploaded to the
-- "demo" folder of the image bucket by npm run db:images; this file only points the content at them.
-- Safe to run again.

update public.initiatives set cover_path = 'demo/radspur.jpg' where title = 'Sichere Radspur Lindwurmstraße' and cover_path is null;
update public.initiatives set cover_path = 'demo/volleyball.jpg' where title = 'Neue Volleyball-Linien im Westpark' and cover_path is null;
update public.initiatives set cover_path = 'demo/trinkbrunnen.jpg' where title = 'Trinkbrunnen am Harras' and cover_path is null;
update public.initiatives set cover_path = 'demo/solardach.jpg' where title = 'Solardach auf der Grundschule' and cover_path is null;
update public.initiatives set cover_path = 'demo/schulweg.jpg' where title = 'Tempo 30 vor allen Schulen' and cover_path is null;
update public.initiatives set cover_path = 'demo/elektrobus.jpg' where title = 'Klimaneutraler Nahverkehr 2035' and cover_path is null;

update public.groups set cover_path = 'demo/volleyball.jpg' where name = 'Westpark Volleyball' and cover_path is null;
update public.groups set cover_path = 'demo/buero.jpg' where name = 'Radentscheid Sendling' and cover_path is null;
update public.groups set cover_path = 'demo/repair-cafe.jpg' where name = 'Repair-Café Harras' and cover_path is null;
update public.groups set cover_path = 'demo/hinterhof.jpg' where name = 'Gemeinschaftsgarten Harras' and cover_path is null;

insert into public.listing_images (listing_id, path, position)
select l.id, 'demo/repair-cafe.jpg', 0 from public.listings l
 join public.profiles p on p.id = l.owner_id and p.is_demo
 where l.title like 'Fahrrad reparieren%'
on conflict (listing_id, path) do nothing;
