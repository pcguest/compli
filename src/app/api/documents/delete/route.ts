import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function DELETE(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const forceDelete = searchParams.get('force') === 'true';

  if (!id) {
    return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
  }

  try {
    // Verify document ownership and get file name
    const { data: document, error: dbFetchError } = await supabase
      .from('documents')
      .select('file_name')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (dbFetchError || !document) {
      console.error('Supabase DB Fetch Error or Document Not Found:', dbFetchError);
      return NextResponse.json({ error: 'Document not found or unauthorized' }, { status: 404 });
    }

    if (forceDelete) {
      // Hard delete from storage
      const fileExt = document.file_name.split('.').pop();
      const fileName = `${id}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([filePath]);

      if (storageError) {
        console.error('Supabase Storage Delete Error:', storageError);
        return NextResponse.json({ error: storageError.message }, { status: 500 });
      }

      // Hard delete from database
      const { error: dbDeleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (dbDeleteError) {
        console.error('Supabase DB Hard Delete Error:', dbDeleteError);
        return NextResponse.json({ error: dbDeleteError.message }, { status: 500 });
      }

      return NextResponse.json({ message: 'Document permanently deleted' });
    } else {
      // Soft delete (move to trash)
      const { error: dbUpdateError } = await supabase
        .from('documents')
        .update({ deleted: true })
        .eq('id', id)
        .eq('user_id', user.id);

      if (dbUpdateError) {
        console.error('Supabase DB Soft Delete Error:', dbUpdateError);
        return NextResponse.json({ error: dbUpdateError.message }, { status: 500 });
      }

      return NextResponse.json({ message: 'Document moved to trash' });
    }
  } catch (error: any) {
    console.error('Unexpected error during document deletion:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
