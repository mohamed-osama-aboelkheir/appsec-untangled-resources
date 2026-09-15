**Vulnerable**

```ruby
def destroy
  Document.find(params[:id]).destroy
  head :no_content
end
```

**Mitigated**

```ruby
def destroy
  current_user.documents.find(params[:id]).destroy
  head :no_content
end
```

Scoping through the association means `find` raises `RecordNotFound`, which
Rails renders as `404`, for documents owned by anyone else.
