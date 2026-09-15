**Vulnerable**

```python
@login_required
def delete_document(request, pk):
    Document.objects.filter(pk=pk).delete()
    return HttpResponse(status=204)
```

**Mitigated**

```python
@login_required
def delete_document(request, pk):
    document = get_object_or_404(Document, pk=pk, owner=request.user)
    document.delete()
    return HttpResponse(status=204)
```

`get_object_or_404` raises the same `404` whether the document belongs to
someone else or doesn't exist.
